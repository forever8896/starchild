export { hasWallet, createWallet, getWalletAddress, getPublicClient } from './wallet'
export {
  registerIdentity,
  getIdentityInfo,
  checkRegistrationStatus,
  type IdentityInfo,
  type RegistrationStatus,
} from './identity'
export { IDENTITY_REGISTRY_ADDRESS } from './abi'
export {
  mintAttestation,
  getAttestations,
  MILESTONES,
  type Attestation,
} from './attestation'
