# Plan: Manual Label Positioning and Scaling in Slope Editor

Implement manual control over slope numbering and dates, allowing users to add, position, and resize labels independently within the slope demarcation tool.

## User Review Required
> [!IMPORTANT]
> The "Move" mode will allow dragging both the slope number and the status date. Scaling sliders will appear when a slope area is selected.

- Does the "Move" icon in the toolbar clearly communicate its purpose for labels?
- Should we add a button to "Reset" label positions to the default (center of polygon)?

## Technical Details

### 1. Enhanced Data Model
- Update `PolygonEditor` state to handle `numero_x`, `numero_y`, `numero_scale`, `data_x`, `data_y`, and `data_scale`.
- Ensure these coordinates are relative to the image dimensions (0 to imageWidth/Height) to maintain consistency across zoom levels.

### 2. UI/UX Implementation
- **Toolbar Updates**: 
    - Ensure the `Move` button is active and functional.
    - Add two new buttons: "Add Number" and "Add Date" to explicitly trigger manual placement if they are missing/reset.
- **Canvas Interaction**:
    - In `move` mode, render handles or highlights over the number and date labels.
    - Implement `onMouseDown` / `onMouseMove` logic for dragging labels.
- **Scaling Controls**:
    - When a slope is selected, show two sliders in a "Label Settings" panel (possibly absolute positioned near the selection or in a sidebar overlay).

### 3. Rendering & Persistence
- Update the SVG overlay to use the manual coordinates if they exist, otherwise fallback to the calculated centroid of the polygon.
- Ensure `handleExport` (the high-res canvas renderer) uses these exact coordinates and scales.
- Hook into `onSave` to persist coordinates to the database via `saveTaludeMarcacao`.

### 4. Safety & Precision
- Keep the vertices of the polygon editable in `edit` mode.
- Labels will only be movable in `move` mode to prevent accidental overlap with vertex editing.
