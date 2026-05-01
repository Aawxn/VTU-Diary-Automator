# Known Issues

## Background Tab Throttling

When the VTU tab is hidden, Chrome or Edge can throttle custom widget behavior.

Impact:

- slower automation
- delayed UI reactions
- date-picker or dropdown failures in some runs

## Custom Widget Fragility

The VTU portal uses custom controls for:

- date selection
- skills selection
- sometimes internship selection

These controls may not behave like normal HTML inputs.

## Slow Network or Delayed Rendering

Potential symptoms:

- missing internship options
- page transition delays
- buttons appearing late
- save confirmation timing issues

## Notifications

Browser notifications depend on:

- browser support
- user notification settings
- allowed extension notification behavior

The UI status should still be treated as the primary source of truth.

## Extension Runtime Constraints

- the extension should be loaded unpacked from `extension/`
- MV3 packaging should not depend on files outside the extension directory
- therefore `extension/data.json` remains a runtime mirror even though `shared/data.json` is canonical
