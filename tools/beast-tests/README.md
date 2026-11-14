# Beast mode tests (no test framework needed)

    npx tsx tools/beast-tests/rules.test.ts     # grace rules, credited time, streaks, frame analysis
    npx tsx tools/beast-tests/engine-sim.ts     # a whole simulated day: on-time start, absence, late arrival, excused break, missed part, verdict

Both run after `npm install` (they only need `tsx` and the project's own dependencies).
