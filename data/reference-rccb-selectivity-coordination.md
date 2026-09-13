# RCCB selectivity-coordination reference

Reference rules for coordinating upstream and downstream residual-current devices.

Quick answer: upstream IΔn should be at least two times (2×) the downstream IΔn, and the upstream minimum no-trip time should be longer than the downstream maximum trip time. A delayed or selective upstream device is normally used.

- Selective coordination is achieved when the upstream and downstream RCD trip zones do not overlap, so a downstream fault does not unnecessarily trip the upstream device.
- ABB's application guide gives a usual threshold rule: the upstream rated residual current IΔn should be at least two times the downstream IΔn.
- The upstream device's minimum no-trip time should be longer than the downstream device's maximum trip time. A delayed or selective upstream device is normally used for this reason.
- ABB notes that a ratio of three between upstream and downstream residual-current settings is advisable in practice. The actual product coordination table remains decisive.

Source: https://library.e.abb.com/public/5d0efcd117e34f89ae5562b82913d71e/1SDC007100G0205.pdf
