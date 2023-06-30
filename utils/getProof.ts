import { MerkleTree } from 'merkletreejs'
import keccak256 from "keccak256";

export const getProof = (address: string, array: string[])=> {
    const leafNodes = array.map(addr => keccak256(addr));
    const merkleTree = new MerkleTree(leafNodes, keccak256, { sortPairs: true});
    const hexProof = merkleTree.getHexProof(keccak256(address));
    return hexProof

}