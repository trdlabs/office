/**
 * CityScene — the full-screen landing: atmospheric backdrop + a detailed
 * foreground (street, crosswalk, lamps, trees, props, pedestrians, a car) and
 * the hero glass tower with a stepped crown, reflective glass, marquee sign,
 * and a lit lobby whose door is an interactive, keyboard-operable control.
 *
 * One crisp-pixel SVG in a 480×270 space, bottom-anchored so the street and
 * door never crop.
 */
import { type CSSProperties, type KeyboardEvent } from 'react';
import {
  BirdLayer,
  CloudLayer,
  GROUND_Y,
  OrbLayer,
  SCENE_H,
  SCENE_W,
  SkyLayer,
  SkylineLayer,
  StarLayer,
} from './CityBackdrop';
import { makeRng, PALETTES, pixelText, type CityPalette, type Mood } from './cityArt';

const CX = 240; // tower centre

/* ----------------------------------------------------------------- street */

function Street({ pal }: { pal: CityPalette }) {
  const els = [];
  els.push(<rect key="sw" x={0} y={GROUND_Y} width={SCENE_W} height={10} fill={pal.sidewalk} />);
  els.push(<rect key="swh" x={0} y={GROUND_Y} width={SCENE_W} height={1} fill={pal.sidewalkHi} />);
  els.push(<rect key="curb" x={0} y={GROUND_Y + 9} width={SCENE_W} height={1} fill={pal.curb} />);
  // sidewalk seams
  for (let x = 8; x < SCENE_W; x += 26) {
    els.push(<rect key={`seam${x}`} x={x} y={GROUND_Y} width={1} height={9} fill={pal.curb} opacity={0.6} />);
  }
  // road
  els.push(<rect key="rd" x={0} y={GROUND_Y + 10} width={SCENE_W} height={SCENE_H - (GROUND_Y + 10)} fill={pal.road} />);
  // lane dashes
  for (let x = 6; x < SCENE_W; x += 22) {
    if (x > CX - 40 && x < CX + 40) continue; // leave a gap for the crosswalk
    els.push(<rect key={`lane${x}`} x={x} y={GROUND_Y + 26} width={11} height={2} fill={pal.roadLine} />);
  }
  // crosswalk in front of the tower — zebra stripes run across the road (parallel to traffic)
  const cwX = CX - 34;
  const cwW = 68;
  for (let y = GROUND_Y + 13; y < SCENE_H - 2; y += 8) {
    els.push(<rect key={`cw${y}`} x={cwX} y={y} width={cwW} height={4} fill={pal.crosswalk} opacity={0.85} />);
  }
  return <g aria-hidden="true">{els}</g>;
}

function Tree({ x, pal }: { x: number; pal: CityPalette }) {
  const ty = GROUND_Y;
  return (
    <g aria-hidden="true">
      <rect x={x + 5} y={ty - 11} width={4} height={12} fill={pal.trunk} />
      <rect x={x + 5} y={ty - 11} width={1} height={12} fill={pal.treeHi} opacity={0.4} />
      <rect x={x} y={ty - 27} width={14} height={17} fill={pal.treeShade} />
      <rect x={x + 1} y={ty - 29} width={12} height={17} fill={pal.tree} />
      <rect x={x + 2} y={ty - 31} width={8} height={6} fill={pal.treeHi} />
      <rect x={x + 1} y={ty - 13} width={12} height={2} fill={pal.treeShade} />
    </g>
  );
}

function Bush({ x, pal }: { x: number; pal: CityPalette }) {
  return (
    <g aria-hidden="true">
      <rect x={x} y={GROUND_Y - 5} width={12} height={6} fill={pal.bush} />
      <rect x={x + 2} y={GROUND_Y - 7} width={8} height={3} fill={pal.tree} />
      <rect x={x + 3} y={GROUND_Y - 7} width={4} height={1} fill={pal.treeHi} />
    </g>
  );
}

function Lamp({ x, pal, mood }: { x: number; pal: CityPalette; mood: Mood }) {
  return (
    <g aria-hidden="true">
      {mood === 'night' && (
        <polygon points={`${x + 1},${GROUND_Y - 34} ${x - 9},${GROUND_Y} ${x + 11},${GROUND_Y}`} fill={pal.lampGlow} opacity={0.12} />
      )}
      <rect x={x} y={GROUND_Y - 34} width={2} height={34} fill={pal.lampPost} />
      <rect x={x - 4} y={GROUND_Y - 37} width={10} height={2} fill={pal.lampPost} />
      <rect className="city-lamp__glow" x={x - 3} y={GROUND_Y - 36} width={8} height={3} fill={pal.lampGlow} />
    </g>
  );
}

function Bench({ x, pal }: { x: number; pal: CityPalette }) {
  return (
    <g aria-hidden="true">
      <rect x={x} y={GROUND_Y - 5} width={16} height={2} fill={pal.bench} />
      <rect x={x} y={GROUND_Y - 9} width={16} height={2} fill={pal.bench} />
      <rect x={x + 1} y={GROUND_Y - 4} width={2} height={4} fill={pal.bench} />
      <rect x={x + 13} y={GROUND_Y - 4} width={2} height={4} fill={pal.bench} />
    </g>
  );
}

function Hydrant({ x, pal }: { x: number; pal: CityPalette }) {
  return (
    <g aria-hidden="true">
      <rect x={x} y={GROUND_Y - 7} width={4} height={7} fill={pal.hydrant} />
      <rect x={x - 1} y={GROUND_Y - 8} width={6} height={2} fill={pal.hydrant} />
      <rect x={x - 1} y={GROUND_Y - 5} width={6} height={1} fill={pal.ink} opacity={0.3} />
      <rect x={x + 1} y={GROUND_Y - 7} width={1} height={2} fill={pal.cloudHi} opacity={0.5} />
    </g>
  );
}

function Ped({ x, pal, c }: { x: number; pal: CityPalette; c: string }) {
  return (
    <g aria-hidden="true">
      <rect x={x} y={GROUND_Y - 10} width={3} height={3} fill="#e8c6a8" />
      <rect x={x} y={GROUND_Y - 7} width={3} height={4} fill={c} />
      <rect x={x} y={GROUND_Y - 3} width={1} height={3} fill={pal.ink} />
      <rect x={x + 2} y={GROUND_Y - 3} width={1} height={3} fill={pal.ink} />
    </g>
  );
}

function Car({ x, pal, c }: { x: number; pal: CityPalette; c: string }) {
  const y = GROUND_Y + 18;
  return (
    <g aria-hidden="true">
      <rect x={x} y={y} width={24} height={7} fill={c} />
      <rect x={x + 5} y={y - 4} width={12} height={5} fill={c} />
      <rect x={x + 6} y={y - 3} width={10} height={3} fill={pal.winCool} />
      <rect x={x} y={y + 1} width={24} height={1} fill={pal.cloudHi} opacity={0.3} />
      <rect x={x + 23} y={y + 1} width={2} height={2} fill={pal.lampGlow} />
      <rect x={x + 3} y={y + 6} width={4} height={2} fill={pal.ink} />
      <rect x={x + 17} y={y + 6} width={4} height={2} fill={pal.ink} />
    </g>
  );
}

/* ------------------------------------------------------------------ tower */

function TowerWindows({ pal }: { pal: CityPalette }) {
  const r = makeRng(8181);
  const els = [];
  let idx = 0;
  for (let y = 88; y < 196; y += 8) {
    for (let x = 212; x <= 264; x += 7) {
      const roll = r();
      const fill = roll > 0.68 ? pal.winWarm : roll > 0.46 ? pal.winLit : roll > 0.24 ? pal.winCool : pal.glassLow;
      const twinkle = roll > 0.84;
      els.push(
        <rect
          key={`tw${idx}`}
          className={twinkle ? 'city-win-twinkle' : undefined}
          x={x}
          y={y}
          width={5}
          height={5}
          fill={fill}
          style={twinkle ? ({ animationDelay: `${(idx % 6) * 0.6}s` } as CSSProperties) : undefined}
        />,
      );
      idx++;
    }
  }
  return <g aria-hidden="true">{els}</g>;
}

function Tower({ pal }: { pal: CityPalette }) {
  const sign = pixelText('TRADING LAB');
  const signX = CX - Math.floor(sign.width / 2);
  const signY = 67;
  return (
    <g aria-hidden="true">
      {/* glass curtain wall */}
      <rect x={208} y={62} width={64} height={140} fill={pal.glass} />
      {/* reflective sheen */}
      <rect x={208} y={62} width={28} height={64} fill={pal.glassHi} opacity={0.45} />
      <rect x={208} y={150} width={64} height={52} fill={pal.glassLow} opacity={0.4} />
      {/* vertical mullions + floor bands */}
      {[214, 221, 228, 235, 242, 249, 256, 263].map((x) => (
        <rect key={`vm${x}`} x={x} y={62} width={1} height={140} fill={pal.mullion} opacity={0.45} />
      ))}
      {Array.from({ length: 14 }, (_, i) => 70 + i * 10).map((y) => (
        <rect key={`fb${y}`} x={208} y={y} width={64} height={1} fill={pal.glassLow} opacity={0.6} />
      ))}
      <TowerWindows pal={pal} />

      {/* piers */}
      <rect x={196} y={58} width={12} height={144} fill={pal.pier} />
      <rect x={272} y={58} width={12} height={144} fill={pal.pier} />
      <rect x={196} y={58} width={2} height={144} fill={pal.pierHi} />
      <rect x={282} y={58} width={2} height={144} fill={pal.pierShade} />
      <rect x={272} y={58} width={2} height={144} fill={pal.pierHi} opacity={0.5} />

      {/* crown: stepped setbacks + spire */}
      <rect x={192} y={55} width={96} height={7} fill={pal.crown} />
      <rect x={192} y={55} width={96} height={1} fill={pal.crownHi} />
      <rect x={214} y={44} width={52} height={12} fill={pal.crown} />
      <rect x={214} y={44} width={52} height={1} fill={pal.crownHi} />
      <rect x={230} y={32} width={20} height={12} fill={pal.crown} />
      <rect x={230} y={32} width={20} height={1} fill={pal.crownHi} />
      <rect x={239} y={16} width={2} height={16} fill={pal.pierShade} />
      <rect className="city-beacon" x={238} y={13} width={4} height={4} fill={pal.beacon} />

      {/* marquee sign */}
      <rect x={signX - 5} y={signY - 4} width={sign.width + 10} height={15} fill={pal.signFrame} />
      <rect x={signX - 5} y={signY - 4} width={sign.width + 10} height={1} fill={pal.accent} opacity={0.5} />
      <rect x={signX - 5} y={signY + 10} width={sign.width + 10} height={1} fill={pal.accent} opacity={0.5} />
      {sign.pixels.map(([px, py], i) => (
        <rect key={`sg${i}`} x={signX + px} y={signY + py} width={1} height={1} fill={pal.signOn} />
      ))}
    </g>
  );
}

/* ------------------------------------------------------------------- door */

function Door({ pal, onEnter, label }: { pal: CityPalette; onEnter: () => void; label: string }) {
  const onKey = (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onEnter();
    }
  };
  return (
    <g className="city-door" role="button" tabIndex={0} aria-label={label} onClick={onEnter} onKeyDown={onKey}>
      {/* lobby ground floor */}
      <rect x={205} y={200} width={70} height={22} fill={pal.lobby} />
      <rect x={205} y={200} width={70} height={2} fill={pal.crown} />
      {/* columns */}
      {[209, 224, 256, 271].map((x) => (
        <rect key={`col${x}`} x={x} y={201} width={3} height={21} fill={pal.pier} />
      ))}
      {/* warm interior glow */}
      <rect x={226} y={202} width={28} height={20} fill={pal.lobbyGlow} />
      {/* glass doors */}
      <rect x={229} y={203} width={22} height={19} fill={pal.glassLow} />
      <rect x={229} y={203} width={22} height={19} fill={pal.lobbyGlow} opacity={0.4} />
      <rect x={239} y={204} width={2} height={18} fill={pal.crown} />
      <rect x={231} y={216} width={18} height={6} fill={pal.lobbyGlow} />
      {/* awning */}
      <rect x={222} y={197} width={36} height={4} fill={pal.awning} />
      <rect x={222} y={197} width={36} height={1} fill={pal.crownHi} opacity={0.4} />
      {[225, 231, 237, 243, 249, 255].map((x) => (
        <rect key={`aw${x}`} x={x} y={197} width={3} height={4} fill={pal.signFrame} opacity={0.18} />
      ))}
      {/* steps */}
      <rect x={220} y={GROUND_Y} width={40} height={2} fill={pal.sidewalkHi} />
      {/* planters */}
      <rect x={214} y={214} width={6} height={8} fill={pal.bench} />
      <rect x={214} y={212} width={6} height={3} fill={pal.bush} />
      <rect x={260} y={214} width={6} height={8} fill={pal.bench} />
      <rect x={260} y={212} width={6} height={3} fill={pal.bush} />

      {/* hit area + hover frame */}
      <rect className="city-door__hit" x={222} y={196} width={36} height={28} fill="transparent" />
      <rect className="city-door__frame" x={226} y={199} width={28} height={24} fill="none" stroke={pal.accent} strokeWidth={1} />

      {/* bobbing "click me" chevron */}
      <g className="city-door__hint" aria-hidden="true">
        <rect x={CX - 5} y={184} width={10} height={2} fill={pal.accent} />
        <rect x={CX - 4} y={186} width={8} height={2} fill={pal.accent} />
        <rect x={CX - 3} y={188} width={6} height={1} fill={pal.accent} />
        <rect x={CX - 2} y={189} width={4} height={1} fill={pal.accent} />
        <rect x={CX - 1} y={190} width={2} height={1} fill={pal.accent} />
      </g>
    </g>
  );
}

/* ------------------------------------------------------------------ scene */

export function CityScene({
  mood = 'day',
  onEnter,
  doorLabel,
  seed = 21,
}: {
  mood?: Mood;
  onEnter: () => void;
  doorLabel: string;
  seed?: number;
}) {
  const pal = PALETTES[mood];
  return (
    <svg
      className="city-scene"
      viewBox={`0 0 ${SCENE_W} ${SCENE_H}`}
      preserveAspectRatio="xMidYMax slice"
      shapeRendering="crispEdges"
    >
      <SkyLayer mood={mood} />
      <StarLayer mood={mood} seed={seed + 1} />
      <OrbLayer mood={mood} />
      <BirdLayer mood={mood} seed={seed + 4} />
      <CloudLayer mood={mood} seed={seed + 2} count={6} />
      <SkylineLayer mood={mood} seed={seed} layer="far3" />
      <SkylineLayer mood={mood} seed={seed + 5} layer="far2" />
      <SkylineLayer mood={mood} seed={seed + 9} layer="far1" />
      <SkylineLayer mood={mood} seed={seed + 13} layer="blocks" />
      <Street pal={pal} />
      {/* foreground props */}
      <Tree x={70} pal={pal} />
      <Tree x={150} pal={pal} />
      <Tree x={318} pal={pal} />
      <Tree x={398} pal={pal} />
      <Bush x={120} pal={pal} />
      <Bush x={350} pal={pal} />
      <Bench x={96} pal={pal} />
      <Hydrant x={300} pal={pal} />
      <Lamp x={186} pal={pal} mood={mood} />
      <Lamp x={294} pal={pal} mood={mood} />
      <Lamp x={40} pal={pal} mood={mood} />
      <Lamp x={440} pal={pal} mood={mood} />
      <Ped x={112} pal={pal} c={pal.ped[0]!} />
      <Ped x={132} pal={pal} c={pal.ped[1]!} />
      <Ped x={336} pal={pal} c={pal.ped[2]!} />
      <Ped x={372} pal={pal} c={pal.ped[3]!} />
      <Car x={64} pal={pal} c={pal.car[0]!} />
      <Car x={388} pal={pal} c={pal.car[1]!} />
      <Tower pal={pal} />
      <Door pal={pal} onEnter={onEnter} label={doorLabel} />
    </svg>
  );
}
