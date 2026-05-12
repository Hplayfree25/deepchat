'use client';

import React from 'react';

const letters = [
  { value: 'D', x: 0 },
  { value: 'e', x: 18 },
  { value: 'e', x: 31 },
  { value: 'p', x: 44 },
  { value: 'C', x: 60 },
  { value: 'h', x: 78 },
  { value: 'a', x: 93 },
  { value: 't', x: 107 }
];

type DeepChatWordmarkSvgProps = React.SVGProps<SVGSVGElement>;

export default function DeepChatWordmarkSvg({ className = '', ...props }: DeepChatWordmarkSvgProps) {
  return (
    <svg
      viewBox="0 0 120 32"
      role="img"
      aria-label="DeepChat"
      className={className}
      preserveAspectRatio="xMinYMid meet"
      {...props}
    >
      <g>
        {letters.map((letter, index) => (
          <text
            key={`${letter.value}-${index}`}
            x={letter.x}
            y="24"
            fill="currentColor"
            fontFamily="Arial, Helvetica, sans-serif"
            fontSize="24"
            fontWeight="800"
            letterSpacing="0"
          >
            {letter.value}
          </text>
        ))}
      </g>
    </svg>
  );
}
