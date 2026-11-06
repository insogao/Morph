declare module "flubber" {
  const flubber: {
    interpolate(from: string, to: string, options?: { maxSegmentLength?: number }): (t: number) => string;
  };
  export default flubber;
}
