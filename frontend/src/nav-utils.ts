export function navLinkClass(isActive: boolean, mobile = false): string {
  if (mobile) {
    return `block w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
      isActive ? "bg-amber-500 text-zinc-950 font-medium" : "text-zinc-400 hover:text-white hover:bg-zinc-800"
    }`;
  }
  // Desktop: underline active indicator (matches V1 Signal design)
  return `px-1 py-2 text-sm font-medium transition-colors border-b-2 leading-none ${
    isActive
      ? "text-zinc-100 border-amber-400 font-semibold"
      : "text-zinc-400 border-transparent hover:text-zinc-100"
  }`;
}

export function bottomTabClass(isActive: boolean): string {
  return `flex flex-col items-center justify-center flex-1 py-2 transition-colors ${
    isActive ? "text-amber-400 font-medium" : "text-zinc-500"
  }`;
}
