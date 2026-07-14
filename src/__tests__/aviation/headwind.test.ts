import { describe, it, expect } from 'vitest'
import { headwindKt, crosswindKt } from '../../../src/lib/aviation/coordinates'

describe('headwindKt', () => {
  it('full headwind when wind aligns with runway', () => {
    expect(headwindKt(270, 20, 270)).toBe(20)
  })
  it('full tailwind when wind is opposite', () => {
    expect(headwindKt(90, 20, 270)).toBe(-20)
  })
  it('zero component when wind is 90° off', () => {
    expect(headwindKt(0, 20, 270)).toBeCloseTo(0, 0)
  })
  it('partial headwind at 45°', () => {
    // cos(45°) ≈ 0.707
    expect(headwindKt(225, 20, 270)).toBeCloseTo(14, 0)
  })
  it('wraps correctly across 360°', () => {
    expect(headwindKt(350, 15, 10)).toBeCloseTo(14, 0)
  })
})

describe('crosswindKt', () => {
  it('zero component when wind aligns with runway', () => {
    expect(crosswindKt(270, 20, 270)).toBeCloseTo(0, 0)
  })
  it('full crosswind from the right at 90°', () => {
    expect(crosswindKt(0, 20, 270)).toBeCloseTo(20, 0)
  })
  it('full crosswind from the left at -90°', () => {
    expect(crosswindKt(180, 20, 270)).toBeCloseTo(-20, 0)
  })
  it('partial crosswind at 45°', () => {
    // sin(45°) ≈ 0.707
    expect(crosswindKt(225, 20, 270)).toBeCloseTo(-14, 0)
  })
})
