/**
 * Carbon Pro Workshop hardware primitives - mirrored from the Vision Studio-X
 * website (src/components/hardware). Each primitive must drive real state, never
 * pure decoration. See DESIGN.md §Component Vocabulary.
 */
export { Led } from './Led';
export { Lcd } from './Lcd';
export { MonoLabel } from './MonoLabel';
export { HexBolt, HexBoltSet, HEX_BOLT_INSET } from './HexBolt';
export { Faceplate } from './Faceplate';
export { ChromeButton } from './ChromeButton';
export {
  LED_VARS,
  CAP_VARS,
  resolveHardwareColor,
  type LedColor,
  type CapabilityColor,
} from './tokens';
