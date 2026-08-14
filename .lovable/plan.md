# Plan: Include Scaffolding Status in Legal Items Export

The goal is to ensure the "Needs Scaffolding" (Andaime) status is included in both PDF and Excel exports for the Legal Items panel.

## User Review Required

> [!IMPORTANT]
> The "Andaime" status will be added as a new column in both Excel and PDF exports. In Excel, it will be a "SIM/NÃO" column. In PDF, it will be included in the main table.

## Proposed Changes

### Logic & Export
#### [src/lib/legal-export.ts]
- Update `exportLegalXLSX` to include a "Necessita Andaime" column with "SIM" or "NÃO".
- Update `exportLegalPDF` to include "Andaime" in the table headers.
- Adjust PDF column widths to accommodate the new "Andaime" column.
- Map the `precisaAndaime` property to a display value (e.g., "SIM" / "—") in the PDF body.

## Verification Plan

### Automated Tests
- I will verify the code structure and type consistency in `src/lib/legal-export.ts`.

### Manual Verification
- I will trigger the Excel export and check if the "Necessita Andaime" column is present.
- I will trigger the PDF export and check if the "Andaime" column is present in the table.
