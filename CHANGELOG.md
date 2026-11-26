# Changelog

## 1.1.0

### Added

- Multi-platform GitHub Actions builds for Linux x64, Windows x64, macOS arm64 and macOS x64, with draft release creation and SHA-256 checksums on version tags.
- Configuration export and import with versioned JSON, validation, confirmation, backup and rollback. Browser authentication and DRM data remain local.
- Automated regression tests integrated into `npm run check`.
- Direct TV buffering feedback: retained recent video frame and loading indicator during stalls and reconnection.

### Fixed

- Personal streaming-service numbers are applied before catalogue validation, independent of JSON order.
- Factory-assigned service numbers can be cleared persistently.
- Configuration imports accept valid predefined service number overrides.

### Current capabilities

- Configurable TV, radio and official streaming-service catalogues, favorites, groups and numeric shortcuts.
- Direct playback by default where available, Web and Auto modes, MP3/AAC/HLS radio, alternative logo search and Undo.
- English, Italian, French and German interfaces, Open Sans typography, separate development and production profiles, and factory reset with backup.

### Known limitations

- macOS packages are experimental, without Developer ID signing or notarization; runtime and DRM playback on physical Macs are unverified.
- Netflix playback is confirmed on Linux; other platforms and services need individual testing.
- Rai Storia may require a manual Play click in its official player.
- Stream availability depends on external providers. Physical IR remote testing is deferred.

### Planned

- 1.2: programme guide, scheduled viewing, stream diagnostics and alternative stream URLs.
- 1.3: remote-control navigation and mappings, sleep timer and radio improvements.
- 2.0: independent streaming-service catalogue and multiple profiles.
