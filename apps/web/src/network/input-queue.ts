import { INPUT_QUEUE_LIMIT, parseInputFrame, sequenceIsNewer, type InputAck, type PlayerInputFrame } from "@kartsick/protocol";

/** Latest input retransmission and prediction history, independently bounded per local human. */
export class InputQueue {
  private readonly frames = new Map<string, PlayerInputFrame[]>();
  push(value: PlayerInputFrame): void {
    const frame = parseInputFrame(value);
    if (!this.frames.has(frame.playerId) && this.frames.size >= 16) throw new RangeError("Input queue player limit.");
    const queue = this.frames.get(frame.playerId) ?? [];
    const latest = queue.at(-1);
    if (latest && !sequenceIsNewer(frame.sequence, latest.sequence)) return;
    queue.push(frame);
    if (queue.length > INPUT_QUEUE_LIMIT) queue.splice(0, queue.length - INPUT_QUEUE_LIMIT);
    this.frames.set(frame.playerId, queue);
  }
  acknowledge(acks: readonly InputAck[]): void {
    for (const ack of acks) {
      const queue = this.frames.get(ack.playerId);
      if (queue) this.frames.set(ack.playerId, queue.filter(frame => sequenceIsNewer(frame.sequence, ack.sequence)));
    }
  }
  pending(playerId?: string): PlayerInputFrame[] {
    return structuredClone(playerId ? this.frames.get(playerId) ?? [] : [...this.frames.values()].flat());
  }
  latest(playerIds: readonly string[]): PlayerInputFrame[] {
    return structuredClone(playerIds.flatMap(id => this.frames.get(id)?.slice(-4) ?? []));
  }
  drain(): PlayerInputFrame[] { const result = this.pending(); this.frames.clear(); return result; }
  clear(): void { this.frames.clear(); }
}
