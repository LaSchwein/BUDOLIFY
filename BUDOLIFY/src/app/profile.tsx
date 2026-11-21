import ProfileModal from '@/components/profile/profile-modal';
import { ProfileModalOverlay } from '../components/profile/profile-modal-overlay';

export default function ProfileRoute() {
  return (
    <ProfileModalOverlay>
      <ProfileModal />
    </ProfileModalOverlay>
  );
}
