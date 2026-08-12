# Plan: Corretiva Offline Sync and Camera Optimization

Optimize the `corretiva-novo` module for faster field operation, implementing an offline-first photo attachment system and direct camera access with a gallery fallback.

## Proposed Changes

### 1. Offline & Sync Optimization
- **Faster UI Feedback**: Update `OsDetailsDialog` to immediately show a local preview of the photo using `URL.createObjectURL(file)` after saving the blob to IndexedDB, instead of waiting for the server upload.
- **Enhanced Outbox Logic**: Ensure all photo attachments are queued in the IndexedDB `outbox` immediately.
- **Background Sync**: Implement a global sync interval (every 10 seconds) in `src/routes/__root.tsx` or a dedicated hook to process pending items in the `outbox` when the device is online.

### 2. Camera Access Improvements
- **Direct Camera Trigger**: Add `capture="environment"` to the file inputs for "Antes" and "Depois" photos to force the mobile browser to open the camera directly.
- **Gallery Access**: Add a new button or dropdown option labeled "Galeria" that allows the user to pick an existing image without the `capture` attribute.
- **Improved UI**: Modernize the photo buttons to clearly distinguish between "Tirar Foto" (Camera) and "Anexar da Galeria".

### 3. Backend & Data Safety
- **Sync Reliability**: Update the outbox processor to handle ImgBB uploads sequentially, updating the OS status or photo record only after a successful upload.
- **Status Indicator**: Show a clear sync status (e.g., "Sincronizando..." or "Aguardando conexão") in the OS details dialog.

## Technical Details
- **IndexedDB Stores**: `os_cache` (OS data), `outbox` (pending actions), `blobs` (temporary image storage).
- **Camera Attribute**: `<input type="file" accept="image/*" capture="environment" />`
- **Sync Hook**: Use a custom `useOfflineSync` hook to manage the background processing of the outbox.
