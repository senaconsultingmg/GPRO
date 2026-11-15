import { notifications } from '@mantine/notifications';
import { imprimirEtiquetas } from '../api/impressao';

/** Imprime e avisa o resultado; pendências ficam reenviáveis na tela de etiquetas. */
export async function imprimirComAviso(etiquetas: { id: string; codigo: string }[]) {
  if (!etiquetas.length) return;
  const r = await imprimirEtiquetas(etiquetas.map((e) => e.id));
  if (r.impressas.length) {
    notifications.show({
      color: 'green',
      title: 'Etiquetas impressas',
      message: r.impressas.join(', '),
      autoClose: 4000,
    });
  }
  if (r.pendentes.length) {
    notifications.show({
      color: 'orange',
      title: `${r.pendentes.length} etiqueta(s) com impressão pendente`,
      message: `${r.pendentes.map((p) => p.codigo).join(', ')} — ${r.pendentes[0].mensagem} Reenvie em "Etiquetas".`,
      autoClose: 10000,
    });
  }
}
