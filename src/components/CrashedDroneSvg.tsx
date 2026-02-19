import { keyframes } from '@emotion/react'
import styled from '@emotion/styled'

const rise = keyframes`
  0% { opacity: 0.5; transform: translateY(0); }
  100% { opacity: 0; transform: translateY(-18px); }
`

const SmokeWisp = styled.ellipse`
  animation: ${rise} 2.5s ease-out infinite;
`

const SmokeWisp2 = styled.ellipse`
  animation: ${rise} 3s ease-out 0.8s infinite;
`

const SmokeWisp3 = styled.ellipse`
  animation: ${rise} 2.8s ease-out 1.6s infinite;
`

export function CrashedDroneSvg(): React.ReactElement {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 220" fill="none" width="200" height="220">
      {/* Whole drone tilted ~18° */}
      <g transform="rotate(18 100 100)">
        {/* X-frame arms — front-right arm bent */}
        <line x1="100" y1="100" x2="36" y2="36" stroke="#1e293b" strokeWidth="8" strokeLinecap="round" />
        {/* Front-right arm: bent with a kink */}
        <polyline points="100,100 140,60 164,36" stroke="#1e293b" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <line x1="100" y1="100" x2="164" y2="164" stroke="#1e293b" strokeWidth="8" strokeLinecap="round" />
        <line x1="100" y1="100" x2="36" y2="164" stroke="#1e293b" strokeWidth="8" strokeLinecap="round" />

        {/* Motor pods */}
        <circle cx="36" cy="36" r="9" fill="#1e3a5f" />
        <circle cx="164" cy="36" r="9" fill="#1e3a5f" />
        <circle cx="164" cy="164" r="9" fill="#1e3a5f" />
        <circle cx="36" cy="164" r="9" fill="#1e3a5f" />

        {/* Propeller: Front-Left — frozen at 45°, one blade missing */}
        <g transform="rotate(45 36 36)">
          <ellipse cx="36" cy="20" rx="3.5" ry="16" fill="#3b82f6" opacity="0.85" />
          <ellipse cx="36" cy="20" rx="3.5" ry="16" fill="#3b82f6" opacity="0.85" transform="rotate(120 36 36)" />
          {/* Third blade missing */}
        </g>

        {/* Propeller: Front-Right — frozen at 160°, one blade shortened */}
        <g transform="rotate(160 164 36)">
          <ellipse cx="164" cy="20" rx="3.5" ry="16" fill="#3b82f6" opacity="0.85" />
          <ellipse cx="164" cy="20" rx="3.5" ry="10" fill="#3b82f6" opacity="0.85" transform="rotate(120 164 36)" />
          <ellipse cx="164" cy="20" rx="3.5" ry="16" fill="#3b82f6" opacity="0.85" transform="rotate(240 164 36)" />
        </g>

        {/* Propeller: Rear-Right — frozen at 90°, one blade bent */}
        <g transform="rotate(90 164 164)">
          <ellipse cx="164" cy="148" rx="3.5" ry="16" fill="#3b82f6" opacity="0.85" />
          <ellipse cx="164" cy="148" rx="3.5" ry="16" fill="#3b82f6" opacity="0.85" transform="rotate(120 164 164) skewX(15)" />
          <ellipse cx="164" cy="148" rx="3.5" ry="16" fill="#3b82f6" opacity="0.85" transform="rotate(240 164 164)" />
        </g>

        {/* Propeller: Rear-Left — frozen at 200°, intact */}
        <g transform="rotate(200 36 164)">
          <ellipse cx="36" cy="148" rx="3.5" ry="16" fill="#3b82f6" opacity="0.85" />
          <ellipse cx="36" cy="148" rx="3.5" ry="16" fill="#3b82f6" opacity="0.85" transform="rotate(120 36 164)" />
          <ellipse cx="36" cy="148" rx="3.5" ry="16" fill="#3b82f6" opacity="0.85" transform="rotate(240 36 164)" />
        </g>

        {/* Center body plate */}
        <rect x="72" y="64" width="56" height="72" rx="8" fill="#2563eb" />

        {/* FPV camera mount */}
        <rect x="86" y="52" width="28" height="14" rx="3" fill="#334155" />
        {/* Camera lens */}
        <circle cx="100" cy="59" r="5" fill="#1e293b" />
        <circle cx="100" cy="59" r="3" fill="#0f172a" />
        {/* Recording LED — dead */}
        <circle cx="111" cy="54" r="2" fill="#7f1d1d" opacity="0.4" />

        {/* Motor pod center dots — lights off */}
        <circle cx="36" cy="36" r="3" fill="#374151" />
        <circle cx="164" cy="36" r="3" fill="#374151" />
        <circle cx="164" cy="164" r="3" fill="#374151" />
        <circle cx="36" cy="164" r="3" fill="#374151" />
      </g>

      {/* Smoke wisps — above the tilted drone body */}
      <SmokeWisp cx="112" cy="68" rx="6" ry="3" fill="#6b7280" opacity="0.5" />
      <SmokeWisp2 cx="98" cy="62" rx="5" ry="2.5" fill="#6b7280" opacity="0.4" />
      <SmokeWisp3 cx="120" cy="75" rx="4" ry="2" fill="#6b7280" opacity="0.35" />

      {/* Impact lines — below the drone suggesting crash site */}
      <line x1="85" y1="195" x2="75" y2="205" stroke="#4b5563" strokeWidth="2" strokeLinecap="round" />
      <line x1="100" y1="198" x2="100" y2="210" stroke="#4b5563" strokeWidth="2" strokeLinecap="round" />
      <line x1="115" y1="195" x2="125" y2="205" stroke="#4b5563" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
