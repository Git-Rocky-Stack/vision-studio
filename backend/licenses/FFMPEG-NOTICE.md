# FFmpeg in Vision Studio - license notice and source offer

Vision Studio's backend ships the `ffmpeg` command-line program, unmodified, as
the binary bundled by the Python package **imageio-ffmpeg 0.8.1** (the version
pinned in `backend/requirements/runtime-*.txt`). The backend runs it as a
separate process for video encoding, frame extraction and timeline audio
muxing; Vision Studio does not link against FFmpeg's libraries.

## License

These FFmpeg builds are configured with `--enable-gpl --enable-version3`, so the
`ffmpeg` executable is licensed under the **GNU General Public License,
version 3 or (at your option) any later version (GPL-3.0-or-later)**, as its own
`ffmpeg -L` output states. The full license text is in `GPL-3.0.txt` next to this
file. FFmpeg is Copyright (c) 2000-2026 the FFmpeg developers.

The GPL applies to the `ffmpeg` program only. It does not change the license of
Vision Studio (MIT) or of any other component, which run as separate programs
and communicate with `ffmpeg` only through its command line.

## The exact binaries shipped

| Platform | Bundled file | FFmpeg version | Upstream build | Archive SHA-256 |
|----------|--------------|----------------|----------------|-----------------|
| Windows x64 | `ffmpeg-win-x86_64-v9.0.2.exe` | 9.0.2 | gyan.dev "essentials" build, <https://github.com/GyanD/codexffmpeg/releases/download/9.0.2/ffmpeg-9.0.2-essentials_build.zip> | `60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba` |
| Linux x64 | `ffmpeg-linux-x86_64-v9.0.2` | 9.0.2 (n9.0.2-17-g2a571b6068) | BtbN/FFmpeg-Builds `autobuild-2026-09-30-13-08`, <https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-09-30-13-08/ffmpeg-n9.0.2-17-g2a571b6068-linux64-gpl-9.0.tar.xz> | `68ee646831adaae2495618346f3bba94ff207ff83bbd34d643e7004730d66269` |
| macOS arm64 | `ffmpeg-macos-aarch64-v9.0` | 9.0 | osxexperts.net, <https://www.osxexperts.net/ffmpeg9arm.zip> | `d0c06c5c68ce48af3143b262f7a9118a7c9f67de1e237fcc24ffb14df9c67af9` |

Provenance and checksums come from imageio-ffmpeg's pinned source list:
<https://github.com/imageio/imageio-ffmpeg/blob/v0.8.1/tools/ffmpeg-sources.json>.

## Corresponding source

The complete corresponding source code for FFmpeg is available from the FFmpeg
project:

- FFmpeg 9.0.2 (Windows and Linux binaries): <https://ffmpeg.org/releases/ffmpeg-9.0.2.tar.xz>
  (signature: <https://ffmpeg.org/releases/ffmpeg-9.0.2.tar.xz.asc>)
- FFmpeg 9.0 (macOS arm64 binary): <https://ffmpeg.org/releases/ffmpeg-9.0.tar.xz>
  (signature: <https://ffmpeg.org/releases/ffmpeg-9.0.tar.xz.asc>)
- The Linux build's exact git revision `n9.0.2-17-g2a571b6068` and its build
  scripts, including every third-party library version it compiles in:
  <https://github.com/BtbN/FFmpeg-Builds> (tag `autobuild-2026-09-30-13-08`).
- The Windows build's configuration and bundled-library list:
  <https://www.gyan.dev/ffmpeg/builds/> (release `9.0.2`), whose `ffmpeg -version`
  output (reproduced by running the bundled binary with `-version`) lists every
  `--enable-lib...` component.

## Written offer

For at least three years from the date you received this copy of Vision Studio,
the Vision Studio Team will give any third party, for a charge no more than the
cost of physically performing the distribution, a complete machine-readable copy
of the corresponding source code for the `ffmpeg` binaries listed above, on a
medium customarily used for software interchange. Send requests to
hello@vision-studio-x.com, naming the Vision Studio version and platform.
