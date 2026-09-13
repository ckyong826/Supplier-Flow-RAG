# RCCB residual-current type reference

Reference facts for interpreting residual-current type and sensitivity on an RCCB/RCD. Exact selection still depends on the installation and the product datasheet.

Important boundary: Type A should not automatically be treated as Type AC merely because both detect AC residual current. The exact residual-current type and sensitivity belong to the individual SKU.

- Type AC detects residual sinusoidal alternating current.
- Type A detects the Type AC waveform and specified pulsating DC (direct-current) residual waveforms, which can occur with rectified or electronic loads.
- Type B extends detection to smooth direct-current residual current and is intended for applications such as some drives, inverters, and rectifiers; use the manufacturer and local-standard requirements for selection.
- The rated residual current `IΔn` is the device sensitivity. Common values include 30 mA, 100 mA, and 300 mA; the value belongs to the individual SKU, not automatically to every product in a family.

Sources:
- https://library.e.abb.com/public/54c9c24f0bf34927ad336702fd3ce4a0/1SXU000023C0202_15.pdf
- https://new.abb.com/low-voltage/products/system-pro-m/residual-current-devices/f200-b-type
