"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type SoundEffect = "message-sent" | "turn-finished" | "quiz-correct" | "quiz-incorrect" | "lesson-milestone";

type SoundEffectsContextValue = {
	enabled: boolean;
	setEnabled: (enabled: boolean) => void;
	play: (effect: SoundEffect) => void;
};

const SoundEffectsContext = createContext<SoundEffectsContextValue>({
	enabled: true,
	setEnabled: () => {},
	play: () => {},
});

const CUES: Record<SoundEffect, readonly number[]> = {
	"message-sent": [520],
	"turn-finished": [587, 784],
	"quiz-correct": [740, 988],
	"quiz-incorrect": [392, 330],
	"lesson-milestone": [587, 740, 988],
};

/** Short, quiet synthesized cues. The AudioContext is created only in a browser. */
export function SoundEffectsProvider({ children }: { children: React.ReactNode }) {
	const [enabled, setEnabledState] = useState(true);
	const enabledRef = useRef(true);
	const changedByUserRef = useRef(false);
	const contextRef = useRef<AudioContext | null>(null);

	const setEnabled = useCallback((next: boolean) => {
		changedByUserRef.current = true;
		enabledRef.current = next;
		setEnabledState(next);
	}, []);

	const getContext = useCallback(() => {
		if (typeof window === "undefined" || !window.AudioContext) return null;
		if (!contextRef.current || contextRef.current.state === "closed") {
			contextRef.current = new window.AudioContext();
		}
		return contextRef.current;
	}, []);

	const prepare = useCallback(() => {
		if (!enabledRef.current) return;
		const context = getContext();
		if (context && context.state !== "running") void context.resume().catch(() => {});
	}, [getContext]);

	const play = useCallback((effect: SoundEffect) => {
		if (!enabledRef.current) return;
		const context = getContext();
		if (!context) return;
		const start = () => {
			if (!enabledRef.current || context.state !== "running") return;
			const now = context.currentTime;
			for (const [index, frequency] of CUES[effect].entries()) {
				const offset = index * 0.075;
				const duration = 0.085;
				const oscillator = context.createOscillator();
				const gain = context.createGain();
				oscillator.type = "sine";
				oscillator.frequency.setValueAtTime(frequency, now + offset);
				gain.gain.setValueAtTime(0.0001, now + offset);
				gain.gain.linearRampToValueAtTime(0.028, now + offset + 0.012);
				gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + duration);
				oscillator.connect(gain);
				gain.connect(context.destination);
				oscillator.start(now + offset);
				oscillator.stop(now + offset + duration + 0.01);
			}
		};
		if (context.state === "running") start();
		else void context.resume().then(start).catch(() => {});
	}, [getContext]);

	useEffect(() => {
		let live = true;
		void fetch("/api/settings")
			.then((response) => response.ok ? response.json() : null)
			.then((body: { settings?: { general?: { soundEffects?: boolean } } } | null) => {
				if (!live || changedByUserRef.current) return;
				const next = body?.settings?.general?.soundEffects ?? true;
				enabledRef.current = next;
				setEnabledState(next);
			})
			.catch(() => {});
		return () => { live = false; };
	}, []);

	useEffect(() => {
		// Any real user gesture unlocks Web Audio for later asynchronous cues.
		window.addEventListener("pointerdown", prepare, { passive: true });
		window.addEventListener("keydown", prepare);
		return () => {
			window.removeEventListener("pointerdown", prepare);
			window.removeEventListener("keydown", prepare);
		};
	}, [prepare]);

	useEffect(() => () => {
		if (contextRef.current && contextRef.current.state !== "closed") {
			void contextRef.current.close().catch(() => {});
		}
	}, []);

	return (
		<SoundEffectsContext.Provider value={{ enabled, setEnabled, play }}>
			{children}
		</SoundEffectsContext.Provider>
	);
}

export function useSoundEffects() {
	return useContext(SoundEffectsContext);
}
