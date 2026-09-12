import type { SVGProps } from "react";

export function OrcMark(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 32 36" fill="none" aria-hidden="true" {...props}>
    <path d="M8 15C2 13 2 5 6 1c-1 6 3 7 6 7h8c3 0 7-1 6-7 4 4 4 12-2 14l-1 10-7 9-7-9-1-10Z" fill="currentColor" />
    <path d="m8 15 6 3-2 3-4-3m16-3-6 3 2 3 4-3M11 26l5 3 5-3M12 24v-4m8 4v-4" stroke="#07120d" strokeWidth="2" strokeLinejoin="round" />
  </svg>;
}
