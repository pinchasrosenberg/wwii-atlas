"""Build the daily weather layer of the timeline map from ERA5 (Copernicus/ECMWF reanalysis).

    python map/tools/build_weather.py --era5 path/to/era5     # monthly era5_YYYYMM.nc files (ZIP of daily-mean netCDF4)

Output: one lossless PNG per month, map/weather/wx_YYYYMM.png, holding that month's days stacked top to bottom
(each day is a ny x nx block, row 0 = north). The grid is ERA5's 0.25° grid averaged 2 x 2 to 0.5°, which is plenty
for a hover readout and for placing rain. Per cell, the three colour channels are:
  R  daily mean 2 m temperature: °C + 60, in whole degrees (-60 °C .. +195 °C range, so no clipping in practice)
  G  estimated snow depth in cm (0..255; under 1 cm is 0, 1 cm steps to 50 cm, then 5 cm steps). ERA5 'sd' is snow
     water equivalent (m); depth = sd / 0.3, i.e. an assumed mean snow density of 300 kg/m³, so the map labels it
     as an estimate.
  B  daily precipitation in mm (0..255). The map shows it as rain only when the temperature is above +0.5 °C;
     colder precipitation is snow, which the snow layer already shows.
PNG keeps the files small (the fields are smooth) and the browser decodes them natively.
Also writes map/weather/meta.json with the grid and the months available.
"""
import argparse
import io
import json
import pathlib
import struct
import zipfile
import zlib

import h5py
import numpy as np

SNOW_DENSITY = 0.3        # t/m³


def half(a):
    """2 x 2 block mean over the last two axes; the odd last row/column is kept as is."""
    a = np.nan_to_num(a.astype(np.float64), nan=0.0)
    days, ny, nx = a.shape
    pad = np.pad(a, ((0, 0), (0, ny % 2), (0, nx % 2)), mode="edge")
    return pad.reshape(days, (ny + 1) // 2, 2, (nx + 1) // 2, 2).mean(axis=(2, 4))


def var(zf, prefix, key):
    name = next(n for n in zf.namelist() if n.startswith(prefix))
    with h5py.File(io.BytesIO(zf.read(name)), "r") as h:
        return h[key][:], h["latitude"][:], h["longitude"][:]


def png(rgb):
    """Minimal RGB PNG writer, 'Up' filter on every row (smooth fields compress well)."""
    h, w, _ = rgb.shape
    up = np.diff(rgb.astype(np.int16), axis=0, prepend=0).astype(np.uint8)
    raw = np.concatenate([np.full((h, 1), 2, np.uint8), up.reshape(h, w * 3)], axis=1).tobytes()
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d))
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--era5", type=pathlib.Path, required=True)
    ap.add_argument("--out", type=pathlib.Path, default=pathlib.Path(__file__).resolve().parents[1] / "weather")
    args = ap.parse_args()
    args.out.mkdir(exist_ok=True)

    meta, months, total = None, {}, 0
    for f in sorted(args.era5.glob("era5_*.nc")):
        ym = f.stem[5:11]
        z = zipfile.ZipFile(f)
        t2m, lat, lon = var(z, "2m_temperature", "t2m")         # K
        sd, _, _ = var(z, "snow_depth", "sd")                    # m water equivalent
        tp, _, _ = var(z, "total_precipitation", "tp")          # daily mean of hourly totals (m)
        t2m, sd, tp = half(t2m), half(sd), half(tp)
        if meta is None:                                         # cell centres of the 2 x 2 blocks
            step = 2 * float(abs(lat[1] - lat[0]))
            meta = dict(lat0=float(lat[0]) - step / 4, lon0=float(lon[0]) + step / 4, step=step,
                        ny=int(t2m.shape[1]), nx=int(t2m.shape[2]))
        r = np.clip(np.rint(t2m - 273.15 + 60), 0, 255)
        cm = sd / SNOW_DENSITY * 100
        g = np.clip(np.where(cm < 50, np.floor(cm), np.floor(cm / 5) * 5), 0, 255)
        b = np.clip(np.rint(tp * 24 * 1000), 0, 255)
        rgb = np.stack([r, g, b], axis=-1).astype(np.uint8)
        days = rgb.shape[0]
        data = png(rgb.reshape(days * meta["ny"], meta["nx"], 3))
        (args.out / f"wx_{ym}.png").write_bytes(data)
        months[ym] = days
        total += len(data)
    meta.update(months=months, temp_c="R-60", depth_cm="G", precip_mm="B", snow_density=SNOW_DENSITY,
                source="ERA5 reanalysis (Copernicus/ECMWF): 2 m temperature, snow depth (w.e.), total precipitation")
    (args.out / "meta.json").write_text(json.dumps(meta, separators=(",", ":")), encoding="utf-8")
    print(f"{sum(months.values())} days in {len(months)} files, {total / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
