import { useEffect, useMemo, useState } from "react";
import type React from "react";
import { useCurrentFrame } from "remotion";
import type { EyeState, MouthState } from "./CharacterRig";

type RhubarbCue = {
  start: number;
  end: number;
  value: MouthState;
};

type RhubarbTimeline = {
  mouthCues?: RhubarbCue[];
};

type LipSyncDriverProps = {
  audioPath: string;
  timelinePath: string;
  fps: number;
  children: (state: { mouthState: MouthState; eyeState: EyeState }) => React.ReactNode;
};

export function LipSyncDriver({ timelinePath, fps, children }: LipSyncDriverProps) {
  const frame = useCurrentFrame();
  const [timeline, setTimeline] = useState<RhubarbTimeline>({});

  useEffect(() => {
    let active = true;
    fetch(timelinePath)
      .then((response) => {
        if (!response.ok) throw new Error(`Timeline fetch failed: ${response.status}`);
        return response.json() as Promise<RhubarbTimeline>;
      })
      .then((json) => {
        if (active) setTimeline(json);
      })
      .catch(() => {
        if (active) setTimeline({});
      });
    return () => {
      active = false;
    };
  }, [timelinePath]);

  const seconds = frame / fps;
  const mouthState = useMemo<MouthState>(() => {
    const cue = timeline.mouthCues?.find((item) => seconds >= item.start && seconds < item.end);
    return cue?.value ?? "X";
  }, [seconds, timeline.mouthCues]);

  const eyeState: EyeState = frame % Math.round(fps * 4) > fps * 3.85 ? "closed" : "open";
  return <>{children({ mouthState, eyeState })}</>;
}
