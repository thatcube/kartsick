# Driving study: mechanical reference

The [Double Dash mechanics reference](https://www.mariowiki.com/Mario_Kart:_Double_Dash!!)
was consulted before implementing the driving study. This is a factual summary,
not copied production content. Exact numerical tuning is original and subject
to controller feedback.

- Hold a shoulder button and steer to drift; there is no required hop mechanic.
- Repeated outward countersteering progresses the sparks through three stages.
  Releasing a fully charged drift produces a mini-turbo. This is not a modern
  hold-for-a-fixed-duration charge model.
- In single-player tandem control, the characters can swap positions.
- The complete co-op implementation still needs driver/rear-rider input
  ownership, coordinated swapping, rear slide attacks, item passing/stealing,
  and the simultaneous two-human start boost. Do not label solo swapping as
  complete co-op support.
- The reference start boost is tied to the start signal; both co-op humans can
  strengthen it by coordinating their acceleration. The study currently uses
  an ordinary countdown, not a claimed completed co-op start mechanic.
- Gliding is an explicitly approved addition, not a claim about the reference.

Study bindings use normal browser gamepad mappings. Right trigger or south face
button accelerates; left trigger or east face button brakes/reverses; right
shoulder drifts; north face button swaps; west face button recovers. Left stick
steers and controls pitch in flight. These are remappable without driving aids.

Keyboard: W/Up for acceleration, S/Down for brake/reverse, A/D or Left/Right for
steering, Space for drift, C for swap, R for recovery, Escape for pause. In flight
W/Up dives and S/Down pulls up. Releasing throttle on the ground never continues
acceleration automatically.
