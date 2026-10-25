import { createUserWithEmailAndPassword, deleteUser, updateProfile } from 'firebase/auth';
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { abrirAuthAparte, db } from '../config/firebase';
import type { RolEquipo } from '../constants/roles';

// Alta de mozos y jueces desde Ajustes > Equipo. Sin backend propio, la cuenta de Authentication
// se crea desde el teléfono del admin en una sesión aparte, y el perfil (ya aprobado) lo escribe
// el admin: las reglas solo se lo permiten a él (altaPorAdmin en firestore.rules).

export interface AltaEquipo {
  nombre: string;
  email: string;
  password: string;
  role: RolEquipo;
}

/**
 * Crea la cuenta y devuelve su uid. Si el perfil no se guarda, borra la cuenta recién creada:
 * así no queda un email tomado sin perfil y se puede reintentar con el mismo.
 */
export async function crearCuentaEquipo(alta: AltaEquipo, adminUid: string): Promise<string> {
  const aparte = abrirAuthAparte();
  try {
    const { user } = await createUserWithEmailAndPassword(aparte.auth, alta.email, alta.password);
    // El displayName es cosmético (el nombre real vive en users/{uid}).
    await updateProfile(user, { displayName: alta.nombre }).catch(() => undefined);
    try {
      // En transacción: sin señal falla en el acto en vez de quedar en cola, y se puede deshacer la cuenta.
      await runTransaction(db, async (tx) => {
        tx.set(doc(db, 'users', user.uid), {
          uid: user.uid,
          nombre: alta.nombre,
          // En minúsculas, como lo guarda Authentication: Equipo busca cuentas por email.
          email: (user.email ?? alta.email).toLowerCase(),
          role: alta.role,
          estadoAprobacion: 'aprobado',
          creadoPor: adminUid,
          creadoEn: serverTimestamp(),
        });
      });
    } catch (e) {
      await deleteUser(user).catch(() => undefined);
      throw e;
    }
    return user.uid;
  } finally {
    await aparte.cerrar().catch(() => undefined);
  }
}
