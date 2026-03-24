export function navLinkClass(isActive: boolean, mobile = false): string {
  return `${mobile ? "block w-full px-3 py-2.5" : "px-4 py-2"} rounded-lg text-sm font-medium transition-colors ${
    isActive ? "bg-amber-500 text-zinc-950 font-medium" : "text-zinc-400 hover:text-white hover:bg-zinc-800"
  }`;
}

export function bottomTabClass(isActive: boolean): string {
  return `flex flex-col items-center justify-center flex-1 py-2 transition-colors ${
    isActive ? "text-amber-400 font-medium" : "text-zinc-500"
  }`;
}
