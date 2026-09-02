import { NodeSquareProgram } from "@sigma/node-square";

const PI = Math.PI;

/** Square program rotated 45° so seats render as diamonds. */
export class NodeDiamondProgram extends NodeSquareProgram {
  getDefinition() {
    const definition = super.getDefinition();
    return {
      ...definition,
      CONSTANT_DATA: [[PI / 2], [PI], [0], [PI], [0], [-PI / 2]],
    };
  }
}
