import { MerkleTree } from 'merkletreejs'
import keccak256 from "keccak256";

export const getRoot = (array: string[])=> {
    const leafNodes = array.map(addr => keccak256(addr));
const merkleTree = new MerkleTree(leafNodes, keccak256, { sortPairs: true});

const rootHash = merkleTree.getRoot().toString('hex');

return `0x${rootHash}`


}