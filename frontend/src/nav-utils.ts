export function navLinkClass(isActive: boolean, mobile = false): string {
  return `${mobile ? "block w-full px-3 py-2.5" : "px-4 py-2"} rounded-lg text-sm font-medium transition-colors ${
    isActive ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white hover:bg-gray-800"
  }`;
}
