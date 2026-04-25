// Hero entry point — exports the per-type hero variants to keep the
// proposed `title-detail/Hero` import surface stable while the underlying
// implementations live in dedicated files.
export { default as MovieHero } from "./MovieHero";
export { default as ShowHero } from "./ShowHero";
export type { MovieHeroProps } from "./MovieHero";
export type { ShowHeroProps } from "./ShowHero";
