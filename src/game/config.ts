/** Global tunables. Coordinates: +X = east, -Z = north, +Y = up. 1 unit = 1 metre. */
export const CONFIG = {
  world: {
    half: 230, // playable half-extent
  },
  player: {
    radius: 0.34,
    height: 1.72,
    crouchHeight: 1.1,
    eye: 1.6,
    crouchEye: 0.98,
    walkSpeed: 3.4,
    sprintSpeed: 6.6,
    crouchSpeed: 1.7,
    jumpVelocity: 5.3,
    gravity: 15,
    stepHeight: 0.45,
    staminaMax: 100,
    staminaDrain: 17,
    staminaRegen: 13,
    mouseSensitivity: 0.0022,
  },
  npc: {
    walkSpeed: 1.6,
    runSpeed: 5.4,
    viewRange: 24,
    viewFovDeg: 115,
    catchDistance: 1.25,
    hearSprint: 9,
    hearVehicle: 16,
    loseSightSeconds: 6.5,
  },
  heat: {
    decayDelay: 7,
    decayInterval: 4.5,
  },
  graphics: {
    shadowMapSize: 2048,
    shadowExtent: 70,
    maxPixelRatio: 1.5,
    bloom: true,
  },
} as const;

export const COLORS = {
  terracotta: '#b0583c',
  terracottaDark: '#8f4430',
  brick: '#6e2a26',
  brickDark: '#561e1c',
  plaster: '#ece4d4',
  windowFrame: '#f4f2ec',
  fog: 0xcdd6df,
  hudAccent: '#57d38c',
};
