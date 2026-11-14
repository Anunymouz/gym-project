import { Header } from '@/components/header';
import { BarbellIcon } from '@/components/icons';
import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';
import { colors } from '@/theme';

export default function Trainers() {
  return (
    <Screen scroll tabs>
      <Header title="Trainers" />
      <EmptyState
        icon={<BarbellIcon size={28} color={colors.flare} weight="duotone" />}
        title="Book a personal trainer"
        body="Single sessions or monthly coaching packages with trainers at gyms near you. Coming in Phase 2."
      />
    </Screen>
  );
}
