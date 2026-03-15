export function navLinkClass(isActive: boolean, mobile = false): string {
  return `${mobile ? "block w-full px-3 py-2.5" : "px-4 py-2"} rounded-lg text-sm font-medium transition-colors ${
    isActive ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white hover:bg-gray-800"
  }`;
}

export function bottomTabClass(isActive: boolean): string {
  return `flex flex-col items-center justify-center flex-1 py-2 transition-colors ${
    isActive ? "text-indigo-400" : "text-gray-500"
  }`;
}
