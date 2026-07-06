import { useCallback, useEffect, useRef, useState } from "react";
import { ref, onValue, set } from "firebase/database";
import { database } from "../firebaseConfig";
import { applyElapsedInterest } from "./interest";

const DEFAULT_INTEREST = { enabled: false, rate: 0, period: "monthly" };

export function usePeopleList(uid) {
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  // Guards against the onValue snapshot (fired by our own write) clobbering
  // an even newer local edit that raced ahead of the round-trip.
  const savingRef = useRef(false);

  useEffect(() => {
    if (!uid) {
      setPeople([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const peopleRef = ref(database, `users/${uid}/peopleList`);
    const unsub = onValue(peopleRef, (snapshot) => {
      if (savingRef.current) {
        savingRef.current = false;
        setLoading(false);
        return;
      }
      const data = snapshot.val();
      const rawList = data?.peopleData ? Object.values(data.peopleData) : [];
      const withInterest = rawList.map(applyElapsedInterest);
      setPeople(withInterest);
      setLoading(false);

      // Settle any accrued interest back to Firebase right away. Otherwise
      // the bumped amount only ever lived in local state — the next write
      // from an unrelated edit would carry it along without advancing
      // interest.lastInterestApplied, so the same elapsed window would get
      // recomputed (and double-applied) the next time this list loads.
      const changed = withInterest.some((p, i) => p.amount !== rawList[i]?.amount);
      if (changed) {
        savingRef.current = true;
        set(ref(database, `users/${uid}/peopleList`), { peopleData: withInterest });
      }
    });

    return unsub;
  }, [uid]);

  const persist = useCallback(
    async (nextPeople) => {
      setPeople(nextPeople);
      if (!uid) return;
      savingRef.current = true;
      await set(ref(database, `users/${uid}/peopleList`), {
        peopleData: nextPeople,
      });
    },
    [uid]
  );

  const addPerson = useCallback(
    (name, amount) => {
      const parsedAmount = isNaN(amount) || amount === "" ? amount : parseFloat(amount);
      const person = {
        name,
        amount: parsedAmount,
        status: "neutral",
        extraInfo: [],
        interest: { ...DEFAULT_INTEREST },
      };
      return persist([...people, person]);
    },
    [people, persist]
  );

  const removePerson = useCallback(
    (index) => {
      const next = people.filter((_, i) => i !== index);
      return persist(next);
    },
    [people, persist]
  );

  const updatePerson = useCallback(
    (index, updates) => {
      const next = people.map((p, i) => (i === index ? { ...p, ...updates } : p));
      return persist(next);
    },
    [people, persist]
  );

  const clearAll = useCallback(() => persist([]), [persist]);

  return { people, loading, addPerson, removePerson, updatePerson, clearAll };
}
