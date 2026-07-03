# REFLEXREEF — Simulation Design Spec

## 5-species reef food web (explicit predator-prey graph)
Linear cascade graph (prey -> predator):
  Algae (producer) -> Zooplankton (herbivore) -> Damselfish (small predator) -> Grouper (mid predator) -> Shark (apex predator)

## ODEs (Lotka-Volterra, biomass units, RK4 fixed substep h=0.05)
  dA = r0*A*(1 - A/K0)            - a01*A*Z
  dZ = e1*a01*A*Z                  - a12*Z*D - m1*Z
  dD = e2*a12*Z*D                  - a23*D*G - m2*D
  dG = e3*a23*D*G                  - a34*G*S - m3*G
  dS = e4*a34*G*S                  - m4*S

## Constants (validated: slow cascading drift, no instant collapse, sensitive to overcorrection)
  r0=0.9  K0=140
  a01=0.012 e1=0.45 m1=0.06
  a12=0.018 e2=0.45 m2=0.05
  a23=0.014 e3=0.45 m3=0.04
  a34=0.011 e4=0.45 m4=0.03

## Initial populations
  A=80  Z=30  D=18  G=10  S=5

## Collapse (session end)
  Extinction: any species <= 0.5
  Overpopulation: any species >= 150

## Safe bands (visual warning only)
  Algae 35-120 | Zoo 10-55 | Damselfish 8-40 | Grouper 5-30 | Shark 2.5-25

## Player taps (instant impulse, NOT scaled by speed)
  BOOST +9, CULL -9, per-node cooldown 90ms

## Speed-up
  speedFactor = 1 + (elapsed/180)*2  -> 1x at start to 3x at 3:00
  simDt = realDt * speedFactor; integrate in fixed h=0.05 substeps

## Session cap
  180 seconds (3 min) -> timeout win; or collapse -> loss