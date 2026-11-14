import { Header } from '@/components/header';
import { PhotoHero } from '@/components/photo-hero';
import { Screen } from '@/components/ui/screen';

export default function Trainers() {
  return (
    <Screen scroll tabs>
      <Header title="Trainers" />
      <PhotoHero
        source={require('@/assets/images/photos/trainers.jpg')}
        eyebrow="Coming in Phase 2"
        title="Book a personal trainer"
        body="Single sessions or monthly coaching packages with trainers at gyms near you."
        height={360}
      />
    </Screen>
  );
}
