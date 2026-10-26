import { deleteUser, EmailAuthProvider, reauthenticateWithCredential, type User } from 'firebase/auth';
import { doc, runTransaction } from 'firebase/firestore';
import { db } from '../config/firebase';

// Mi cuenta > Borrar mi cuenta (Google Play exige la baja dentro de la app). Se borran el perfil
// (users, con la foto adentro), la ficha del directorio (jugadores) y el reloj; después, la cuenta
// de Authentication. Torneos y ventas son el historial del local y quedan como están (ver README).

/** Los datos ya se borraron, pero la cuenta de Authentication no. */
export class BajaIncompleta extends Error {
  constructor(readonly causa: unknown) {
    super('Se borraron los datos, pero no la cuenta.');
    this.name = 'BajaIncompleta';
  }
}

/**
 * Primero verifica la contraseña: deleteUser pide un inicio de sesión reciente y, si fallara
 * con los datos ya borrados, quedaría una cuenta sin perfil. Los datos se borran antes que la
 * cuenta porque las reglas piden la sesión. Si solo falla el último paso, tira BajaIncompleta.
 */
export async function borrarMiCuenta(user: User, password: string): Promise<void> {
  if (!user.email) throw Object.assign(new Error('Cuenta sin email.'), { code: 'auth/missing-email' });
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
  // En transacción: sin señal falla en el acto en vez de quedar en cola y borrar los datos más tarde.
  await runTransaction(db, async (tx) => {
    tx.delete(doc(db, 'users', user.uid));
    tx.delete(doc(db, 'jugadores', user.uid));
    tx.delete(doc(db, 'relojes', user.uid));
  });
  try {
    await deleteUser(user);
  } catch (e) {
    throw new BajaIncompleta(e);
  }
}
