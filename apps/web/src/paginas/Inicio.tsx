import { Card, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { formatarDataCivil } from '@apontamento/shared';
import dayjs from 'dayjs';
import { api } from '../api/cliente';
import { useAutenticacao } from '../autenticacao/ContextoAutenticacao';
import { useLista } from '../componentes/PaginaCadastro';

function Indicador({ titulo, valor, caminho }: { titulo: string; valor: number | string; caminho: string }) {
  return (
    <Card withBorder component={Link} to={caminho} padding="lg">
      <Text c="dimmed" size="sm">
        {titulo}
      </Text>
      <Text fw={700} size="2rem">
        {valor}
      </Text>
    </Card>
  );
}

export function PaginaInicio() {
  const { usuario, pode } = useAutenticacao();
  const maquinas = useLista('maquinas', true);
  const moldes = useLista('moldes', true);
  const produtos = useLista('produtos', true);
  const fichas = useQuery({
    queryKey: ['fichas-tecnicas', 'rascunhos'],
    queryFn: () => api.get<unknown[]>('/fichas-tecnicas?situacao=RASCUNHO'),
  });
  const hoje = dayjs().format('YYYY-MM-DD');
  const escala = useQuery({
    queryKey: ['escalas', hoje, hoje],
    queryFn: () =>
      api.get<
        {
          id: string;
          horarioTurno: { nome: string; horaInicio: string; horaFim: string };
          equipe: { letra: string };
        }[]
      >(`/escalas?de=${hoje}&ate=${hoje}`),
    enabled: pode('escala.ler'),
  });
  return (
    <Stack>
      <Title order={2}>Olá, {usuario?.nome.split(' ')[0]}</Title>
      <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }}>
        <Indicador titulo="Máquinas ativas" valor={maquinas.data?.length ?? '…'} caminho="/maquinas" />
        <Indicador titulo="Moldes ativos" valor={moldes.data?.length ?? '…'} caminho="/moldes" />
        <Indicador titulo="Produtos ativos" valor={produtos.data?.length ?? '…'} caminho="/produtos" />
        <Indicador
          titulo="Fichas aguardando aprovação"
          valor={fichas.data?.length ?? '…'}
          caminho="/fichas-tecnicas"
        />
      </SimpleGrid>
      {escala.data && (
        <Card withBorder>
          <Title order={4} mb="xs">
            Escala de hoje — {formatarDataCivil(hoje)}
          </Title>
          {escala.data.length === 0 && <Text c="dimmed">Sem turnos na escala.</Text>}
          {escala.data.map((l) => (
            <Text key={l.id}>
              {l.horarioTurno.nome} ({l.horarioTurno.horaInicio}–{l.horarioTurno.horaFim}): equipe{' '}
              <b>{l.equipe.letra}</b>
            </Text>
          ))}
        </Card>
      )}
    </Stack>
  );
}
