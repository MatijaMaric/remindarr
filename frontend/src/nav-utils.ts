export function navLinkClass(isActive: boolean, mobile = false): string {
  if (mobile) {
    return `block w-full px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
      isActive
        ? "bg-primary text-primary-foreground font-medium"
        : "text-muted-foreground hover:text-foreground hover:bg-muted"
    }`;
  }
  // Desktop: the current destination takes the accent, same as the tab bar.
  return `px-3 py-2 rounded-md text-sm transition-colors ${
    isActive
      ? "text-primary-text font-semibold"
      : "text-muted-foreground font-medium hover:text-foreground hover:bg-accent"
  }`;
}

export function bottomTabClass(isActive: boolean): string {
  return `flex flex-col items-center justify-center flex-1 py-2 transition-colors ${
    isActive ? "text-primary-text font-medium" : "text-muted-foreground"
  }`;
}
