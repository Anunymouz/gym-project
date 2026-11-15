/**
 * BGYM's starter workout library: exercises written by the BGYM team (no third-party content)
 * and six routines built from them. Three are free; the rest unlock with any gym membership.
 * The BGYM team can add photos or short demo videos to each exercise from the admin dashboard.
 */

type Ex = {
  slug: string;
  name: string;
  bodyPart: string;
  targetMuscle: string;
  secondaryMuscles: string[];
  equipment: string;
  instructions: string[];
  tips: string[];
};

export const starterExercises: Ex[] = [
  {
    slug: 'push-up', name: 'Push-up', bodyPart: 'chest', targetMuscle: 'Chest', secondaryMuscles: ['Triceps', 'Shoulders', 'Core'], equipment: 'None',
    instructions: ['Start in a high plank, hands a little wider than your shoulders.', 'Keep a straight line from head to heels and brace your stomach.', 'Bend your elbows to lower your chest until it is just above the floor.', 'Push the floor away to straighten your arms.'],
    tips: ['Elbows point back at about 45°, not straight out.', 'Too hard? Put your knees down or your hands on a bench.'],
  },
  {
    slug: 'incline-push-up', name: 'Incline push-up', bodyPart: 'chest', targetMuscle: 'Chest', secondaryMuscles: ['Triceps', 'Shoulders'], equipment: 'Bench',
    instructions: ['Put your hands on the edge of a bench or sturdy table.', 'Walk your feet back until your body is in a straight line.', 'Lower your chest to the edge, then press back up.'],
    tips: ['The higher the surface, the easier the push-up.'],
  },
  {
    slug: 'dumbbell-bench-press', name: 'Dumbbell bench press', bodyPart: 'chest', targetMuscle: 'Chest', secondaryMuscles: ['Triceps', 'Shoulders'], equipment: 'Dumbbells',
    instructions: ['Lie on a flat bench with a dumbbell in each hand above your chest.', 'Plant your feet and squeeze your shoulder blades together.', 'Lower the dumbbells to the sides of your chest.', 'Press them back up until your arms are straight.'],
    tips: ['Control the way down: about two seconds.', 'Keep your wrists stacked over your elbows.'],
  },
  {
    slug: 'bent-over-dumbbell-row', name: 'Bent-over dumbbell row', bodyPart: 'back', targetMuscle: 'Upper back', secondaryMuscles: ['Biceps', 'Rear shoulders'], equipment: 'Dumbbells',
    instructions: ['Hold a dumbbell in each hand and hinge forward at the hips, back flat.', 'Let the weights hang below your shoulders.', 'Pull the dumbbells towards your hips, squeezing your shoulder blades.', 'Lower them slowly until your arms are straight.'],
    tips: ['Keep your neck in line with your back: look at the floor a little ahead.'],
  },
  {
    slug: 'band-pull-apart', name: 'Band pull-apart', bodyPart: 'back', targetMuscle: 'Upper back', secondaryMuscles: ['Rear shoulders'], equipment: 'Resistance band',
    instructions: ['Hold a band in front of you at shoulder height, hands shoulder-width apart.', 'Keep your arms almost straight and pull the band apart until it touches your chest.', 'Return slowly to the start.'],
    tips: ['Keep your shoulders down, away from your ears.'],
  },
  {
    slug: 'superman', name: 'Superman hold', bodyPart: 'back', targetMuscle: 'Lower back', secondaryMuscles: ['Glutes', 'Hamstrings'], equipment: 'Mat',
    instructions: ['Lie face down with your arms stretched out in front.', 'Lift your arms, chest and legs a few centimetres off the floor.', 'Hold, breathing steadily, then lower with control.'],
    tips: ['Squeeze your glutes; don’t crank your neck up.'],
  },
  {
    slug: 'dumbbell-shoulder-press', name: 'Dumbbell shoulder press', bodyPart: 'shoulders', targetMuscle: 'Shoulders', secondaryMuscles: ['Triceps', 'Upper chest'], equipment: 'Dumbbells',
    instructions: ['Stand or sit tall with the dumbbells at shoulder height, palms forward.', 'Brace your stomach and press the weights overhead.', 'Lower them back to your shoulders with control.'],
    tips: ['Don’t lean back to finish the rep: lighten the weight instead.'],
  },
  {
    slug: 'lateral-raise', name: 'Lateral raise', bodyPart: 'shoulders', targetMuscle: 'Side shoulders', secondaryMuscles: [], equipment: 'Dumbbells',
    instructions: ['Stand with a light dumbbell in each hand at your sides.', 'With a slight bend in the elbows, raise your arms out to the side to shoulder height.', 'Pause, then lower slowly.'],
    tips: ['Lead with your elbows, not your hands.', 'Light weights and slow reps work best here.'],
  },
  {
    slug: 'dumbbell-curl', name: 'Dumbbell biceps curl', bodyPart: 'arms', targetMuscle: 'Biceps', secondaryMuscles: ['Forearms'], equipment: 'Dumbbells',
    instructions: ['Stand with the dumbbells at your sides, palms facing forward.', 'Keep your elbows by your ribs and curl the weights towards your shoulders.', 'Lower them all the way down.'],
    tips: ['No swinging: if your back moves, the weight is too heavy.'],
  },
  {
    slug: 'bench-dip', name: 'Bench dip', bodyPart: 'arms', targetMuscle: 'Triceps', secondaryMuscles: ['Chest', 'Shoulders'], equipment: 'Bench',
    instructions: ['Sit on the edge of a bench, hands beside your hips, fingers forward.', 'Slide your hips off the bench, legs bent in front of you.', 'Bend your elbows to lower your hips, then press back up.'],
    tips: ['Stop when your upper arms are level with the floor.', 'Straighten your legs to make it harder.'],
  },
  {
    slug: 'bodyweight-squat', name: 'Bodyweight squat', bodyPart: 'legs', targetMuscle: 'Quadriceps', secondaryMuscles: ['Glutes', 'Hamstrings'], equipment: 'None',
    instructions: ['Stand with your feet about shoulder-width apart, toes turned out slightly.', 'Push your hips back and bend your knees as if sitting in a chair.', 'Go as low as you can with your heels down and chest up.', 'Drive through your whole foot to stand.'],
    tips: ['Knees follow the direction of your toes.'],
  },
  {
    slug: 'goblet-squat', name: 'Goblet squat', bodyPart: 'legs', targetMuscle: 'Quadriceps', secondaryMuscles: ['Glutes', 'Core'], equipment: 'Dumbbells',
    instructions: ['Hold one dumbbell upright against your chest with both hands.', 'Squat down between your knees, elbows inside your knees at the bottom.', 'Stand back up, keeping the weight close to your chest.'],
    tips: ['The weight in front helps you stay upright.'],
  },
  {
    slug: 'reverse-lunge', name: 'Reverse lunge', bodyPart: 'legs', targetMuscle: 'Quadriceps', secondaryMuscles: ['Glutes', 'Hamstrings'], equipment: 'None',
    instructions: ['Stand tall with your feet hip-width apart.', 'Step one foot back and lower until both knees are bent at about 90°.', 'Push through your front heel to come back to standing.', 'Alternate legs.'],
    tips: ['Keep your front knee over your ankle.', 'Hold dumbbells to make it harder.'],
  },
  {
    slug: 'romanian-deadlift', name: 'Dumbbell Romanian deadlift', bodyPart: 'legs', targetMuscle: 'Hamstrings', secondaryMuscles: ['Glutes', 'Lower back'], equipment: 'Dumbbells',
    instructions: ['Stand holding the dumbbells in front of your thighs, knees soft.', 'Push your hips back and slide the weights down your legs, back flat.', 'Stop when you feel a stretch in your hamstrings.', 'Squeeze your glutes to stand back up.'],
    tips: ['It’s a hinge, not a squat: your knees barely bend.'],
  },
  {
    slug: 'glute-bridge', name: 'Glute bridge', bodyPart: 'glutes', targetMuscle: 'Glutes', secondaryMuscles: ['Hamstrings', 'Core'], equipment: 'Mat',
    instructions: ['Lie on your back with knees bent and feet flat, hip-width apart.', 'Press through your heels and lift your hips until your body is straight from knees to shoulders.', 'Squeeze your glutes at the top, then lower slowly.'],
    tips: ['Don’t arch your lower back at the top.'],
  },
  {
    slug: 'calf-raise', name: 'Calf raise', bodyPart: 'legs', targetMuscle: 'Calves', secondaryMuscles: [], equipment: 'None',
    instructions: ['Stand tall, holding a wall or rail for balance.', 'Rise up onto the balls of your feet as high as you can.', 'Pause, then lower your heels slowly.'],
    tips: ['Do them on a step for a bigger range of motion.'],
  },
  {
    slug: 'plank', name: 'Plank', bodyPart: 'core', targetMuscle: 'Abdominals', secondaryMuscles: ['Shoulders', 'Glutes'], equipment: 'Mat',
    instructions: ['Rest on your forearms and toes, elbows under your shoulders.', 'Make a straight line from head to heels.', 'Brace your stomach and hold, breathing steadily.'],
    tips: ['Hips sagging or piking up? Rest and start again.'],
  },
  {
    slug: 'dead-bug', name: 'Dead bug', bodyPart: 'core', targetMuscle: 'Abdominals', secondaryMuscles: ['Hip flexors'], equipment: 'Mat',
    instructions: ['Lie on your back with arms pointing up and knees bent at 90° above your hips.', 'Press your lower back into the floor.', 'Slowly lower the opposite arm and leg towards the floor.', 'Return and switch sides.'],
    tips: ['Move slowly; your back stays flat the whole time.'],
  },
  {
    slug: 'bicycle-crunch', name: 'Bicycle crunch', bodyPart: 'core', targetMuscle: 'Obliques', secondaryMuscles: ['Abdominals'], equipment: 'Mat',
    instructions: ['Lie on your back, hands lightly behind your head, legs lifted.', 'Bring one knee in as you turn the opposite elbow towards it.', 'Switch sides in a smooth pedalling motion.'],
    tips: ['Don’t pull on your neck: your hands just rest there.'],
  },
  {
    slug: 'mountain-climber', name: 'Mountain climber', bodyPart: 'cardio', targetMuscle: 'Core', secondaryMuscles: ['Shoulders', 'Hip flexors'], equipment: 'None',
    instructions: ['Start in a high plank.', 'Drive one knee towards your chest, then quickly switch legs.', 'Keep going at a steady, fast pace.'],
    tips: ['Keep your hips level with your shoulders.'],
  },
  {
    slug: 'jumping-jack', name: 'Jumping jack', bodyPart: 'cardio', targetMuscle: 'Full body', secondaryMuscles: ['Calves', 'Shoulders'], equipment: 'None',
    instructions: ['Stand with your feet together and arms at your sides.', 'Jump your feet out while raising your arms overhead.', 'Jump back to the start and repeat.'],
    tips: ['Low-impact option: step one foot out at a time.'],
  },
  {
    slug: 'burpee', name: 'Burpee', bodyPart: 'full_body', targetMuscle: 'Full body', secondaryMuscles: ['Chest', 'Legs', 'Core'], equipment: 'None',
    instructions: ['From standing, squat down and put your hands on the floor.', 'Jump or step your feet back to a plank.', 'Jump or step your feet back in.', 'Stand up and finish with a small jump.'],
    tips: ['Add a push-up at the bottom once you’re comfortable.'],
  },
  {
    slug: 'kettlebell-swing', name: 'Kettlebell swing', bodyPart: 'full_body', targetMuscle: 'Glutes', secondaryMuscles: ['Hamstrings', 'Core', 'Shoulders'], equipment: 'Kettlebell',
    instructions: ['Stand with feet a little wider than your hips, kettlebell on the floor in front.', 'Hinge and hike the bell back between your legs.', 'Snap your hips forward to swing it to chest height.', 'Let it fall back between your legs and repeat.'],
    tips: ['The power comes from your hips, not your arms.'],
  },
  {
    slug: 'worlds-greatest-stretch', name: 'World’s greatest stretch', bodyPart: 'full_body', targetMuscle: 'Hips', secondaryMuscles: ['Hamstrings', 'Upper back'], equipment: 'Mat',
    instructions: ['Step into a long lunge with your right foot forward.', 'Put your left hand on the floor and drop your right elbow towards your right foot.', 'Rotate and reach your right arm up to the ceiling.', 'Return and switch sides.'],
    tips: ['Breathe out as you rotate.'],
  },
  {
    slug: 'cat-cow', name: 'Cat–cow', bodyPart: 'back', targetMuscle: 'Spine', secondaryMuscles: ['Core'], equipment: 'Mat',
    instructions: ['Start on your hands and knees.', 'Breathe in as you drop your belly and lift your chest (cow).', 'Breathe out as you round your back towards the ceiling (cat).', 'Move slowly between the two.'],
    tips: ['Let your breath set the pace.'],
  },
  {
    slug: 'hip-flexor-stretch', name: 'Kneeling hip flexor stretch', bodyPart: 'legs', targetMuscle: 'Hip flexors', secondaryMuscles: ['Quadriceps'], equipment: 'Mat',
    instructions: ['Kneel on one knee with the other foot flat in front.', 'Tuck your tailbone under and gently push your hips forward.', 'Hold, then switch sides halfway through.'],
    tips: ['You should feel it at the front of the back hip, not in your lower back.'],
  },
];

type Step = [slug: string, sets: number | null, reps: number | null, durationSec: number | null, restSec: number | null];

export const starterWorkouts: Array<{ slug: string; title: string; description: string; level: string; goal: string; isFree: boolean; photo: string; steps: Step[] }> = [
  {
    slug: 'bgym-bodyweight-basics', title: 'Bodyweight Basics', level: 'beginner', goal: 'strength', isFree: true, photo: 'workout-bodyweight.jpg',
    description: 'A full-body routine with no equipment. Do it at home, at the park or before work: three rounds of the moves everything else is built on.',
    steps: [['bodyweight-squat', 3, 12, null, 45], ['push-up', 3, 8, null, 45], ['glute-bridge', 3, 12, null, 30], ['reverse-lunge', 2, 10, null, 45], ['plank', 3, null, 30, 30]],
  },
  {
    slug: 'bgym-10-minute-core', title: '10-Minute Core', level: 'beginner', goal: 'core', isFree: true, photo: 'workout-core.jpg',
    description: 'Short, steady core work for a stronger middle and a happier back. Slow and controlled beats fast.',
    steps: [['dead-bug', 2, 10, null, 20], ['plank', 2, null, 30, 20], ['bicycle-crunch', 2, 16, null, 20], ['superman', 2, null, 20, 20], ['mountain-climber', 2, null, 30, 30]],
  },
  {
    slug: 'bgym-morning-mobility', title: 'Morning Mobility', level: 'beginner', goal: 'mobility', isFree: true, photo: 'workout-mobility.jpg',
    description: 'Wake up stiff joints in about ten minutes. Good on rest days and before any workout.',
    steps: [['cat-cow', 1, null, 60, 10], ['worlds-greatest-stretch', 2, 5, null, 15], ['hip-flexor-stretch', 1, null, 60, 10], ['glute-bridge', 2, 10, null, 15], ['band-pull-apart', 2, 15, null, 15]],
  },
  {
    slug: 'bgym-dumbbell-full-body', title: 'Full-Body Dumbbell Strength', level: 'intermediate', goal: 'strength', isFree: false, photo: 'workout-dumbbell.jpg',
    description: 'One pair of dumbbells, every major muscle. Pick a weight that leaves two reps in the tank on the last set.',
    steps: [['goblet-squat', 4, 10, null, 75], ['dumbbell-bench-press', 4, 10, null, 75], ['bent-over-dumbbell-row', 4, 10, null, 60], ['romanian-deadlift', 3, 10, null, 60], ['dumbbell-shoulder-press', 3, 10, null, 60], ['dumbbell-curl', 2, 12, null, 45]],
  },
  {
    slug: 'bgym-hiit-fat-burner', title: 'HIIT Fat Burner', level: 'intermediate', goal: 'fat_loss', isFree: false, photo: 'workout-hiit.jpg',
    description: 'Short bursts, short rests. Work hard for every interval and you’ll be done in under twenty minutes.',
    steps: [['jumping-jack', 3, null, 40, 20], ['burpee', 3, null, 30, 30], ['mountain-climber', 3, null, 40, 20], ['kettlebell-swing', 3, 15, null, 30], ['reverse-lunge', 3, null, 40, 20]],
  },
  {
    slug: 'bgym-lower-body-power', title: 'Lower Body Power', level: 'advanced', goal: 'strength', isFree: false, photo: 'workout-lower.jpg',
    description: 'Heavy legs day: squats, hinges and lunges with longer rests so every set is strong.',
    steps: [['goblet-squat', 5, 8, null, 90], ['romanian-deadlift', 4, 8, null, 90], ['reverse-lunge', 3, 12, null, 60], ['glute-bridge', 3, 15, null, 45], ['calf-raise', 3, 20, null, 30], ['plank', 3, null, 45, 30]],
  },
];
