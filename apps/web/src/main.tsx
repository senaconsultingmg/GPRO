import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Center, createTheme, Loader, MantineProvider } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import dayjs from 'dayjs';
import 'dayjs/locale/pt-br';
import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/notifications/styles.css';
import type { Permissao } from '@apontamento/shared';
import { ProvedorAutenticacao, useAutenticacao } from './autenticacao/ContextoAutenticacao';
import { Layout } from './Layout';
import { PaginaLogin } from './paginas/Login';
import { PaginaInicio } from './paginas/Inicio';
import { PaginaMoldes } from './paginas/Moldes';
import { PaginaFichas } from './paginas/Fichas';
import { PaginaEscala } from './paginas/Escala';
import { PaginaParametros } from './paginas/Parametros';
import { PaginaAuditoria } from './paginas/Auditoria';
import { PaginaCadastro, type ConfigCadastro } from './componentes/PaginaCadastro';
import { PaginaOrdens } from './paginas/Ordens';
import { PaginaImportacoes } from './paginas/Importacoes';
import { PaginaRodadas } from './paginas/Rodadas';
import { PaginaApontamento } from './paginas/apontamento/Apontamento';
import { PaginaRelatorioTurno, PaginaTurnos } from './paginas/Turnos';
import { PaginaPosto } from './paginas/Posto';
import { PaginaEtiquetas } from './paginas/Etiquetas';
import { PaginaEstoque } from './paginas/Estoque';
import { PaginaMateriaPrima } from './paginas/MateriaPrima';
import { PaginaLayouts } from './paginas/Layouts';
import * as cfg from './cadastros/configuracoes';

dayjs.locale('pt-br');

// Tela pensada também para tablet: controles com tamanho confortável ao toque.
const tema = createTheme({
  primaryColor: 'blue',
  defaultRadius: 'md',
  components: {
    // Rótulos curtos (situação, origem…) nunca cortados com reticências nas tabelas.
    Badge: {
      styles: {
        root: { overflow: 'visible', flexShrink: 0 },
        label: { overflow: 'visible', textOverflow: 'clip' },
      },
    },
    Button: { defaultProps: { size: 'md' } },
    TextInput: { defaultProps: { size: 'md' } },
    PasswordInput: { defaultProps: { size: 'md' } },
    NumberInput: { defaultProps: { size: 'md' } },
    Select: { defaultProps: { size: 'md' } },
    MultiSelect: { defaultProps: { size: 'md' } },
    Textarea: { defaultProps: { size: 'md' } },
  },
});

const clienteConsultas = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
});

const CADASTROS: [string, ConfigCadastro, Permissao][] = [
  ['/maquinas', cfg.configMaquinas, 'cadastros.ler'],
  ['/produtos', cfg.configProdutos, 'cadastros.ler'],
  ['/conjuntos-padrao', cfg.configConjuntos, 'cadastros.ler'],
  ['/motivos-parada', cfg.configMotivosParada, 'cadastros.ler'],
  ['/tipos-perda', cfg.configTiposPerda, 'cadastros.ler'],
  ['/locais-estoque', cfg.configLocaisEstoque, 'cadastros.ler'],
  ['/impressoras', cfg.configImpressoras, 'cadastros.ler'],
  ['/dispositivos', cfg.configDispositivos, 'cadastros.ler'],
  ['/horarios-turno', cfg.configHorarios, 'cadastros.ler'],
  ['/equipes', cfg.configEquipes, 'cadastros.ler'],
  ['/usuarios', cfg.configUsuarios, 'usuarios.ler'],
];

function Protegida({ permissao, children }: { permissao: Permissao; children: React.ReactNode }) {
  const { pode } = useAutenticacao();
  return pode(permissao) ? children : <Navigate to="/" replace />;
}

function Aplicacao() {
  const { usuario, carregando } = useAutenticacao();
  if (carregando) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }
  if (!usuario) return <PaginaLogin />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<PaginaInicio />} />
        {CADASTROS.map(([caminho, config, permissao]) => (
          <Route
            key={caminho}
            path={caminho}
            element={
              <Protegida permissao={permissao}>
                <PaginaCadastro key={caminho} config={config} />
              </Protegida>
            }
          />
        ))}
        <Route
          path="/moldes"
          element={
            <Protegida permissao="cadastros.ler">
              <PaginaMoldes />
            </Protegida>
          }
        />
        <Route
          path="/fichas-tecnicas"
          element={
            <Protegida permissao="fichas.ler">
              <PaginaFichas />
            </Protegida>
          }
        />
        <Route
          path="/escala"
          element={
            <Protegida permissao="escala.ler">
              <PaginaEscala />
            </Protegida>
          }
        />
        <Route
          path="/parametros"
          element={
            <Protegida permissao="parametros.ler">
              <PaginaParametros />
            </Protegida>
          }
        />
        <Route
          path="/auditoria"
          element={
            <Protegida permissao="auditoria.ler">
              <PaginaAuditoria />
            </Protegida>
          }
        />
        <Route
          path="/ordens"
          element={
            <Protegida permissao="ordens.ler">
              <PaginaOrdens />
            </Protegida>
          }
        />
        <Route
          path="/importacoes"
          element={
            <Protegida permissao="importacoes.ler">
              <PaginaImportacoes />
            </Protegida>
          }
        />
        <Route
          path="/rodadas"
          element={
            <Protegida permissao="rodadas.ler">
              <PaginaRodadas />
            </Protegida>
          }
        />
        <Route
          path="/apontamento"
          element={
            <Protegida permissao="apontamento.lancar">
              <PaginaApontamento />
            </Protegida>
          }
        />
        <Route
          path="/turnos"
          element={
            <Protegida permissao="turnos.ler">
              <PaginaTurnos />
            </Protegida>
          }
        />
        <Route
          path="/turnos/:id/relatorio"
          element={
            <Protegida permissao="turnos.ler">
              <PaginaRelatorioTurno />
            </Protegida>
          }
        />
        <Route path="/posto" element={<PaginaPosto />} />
        <Route
          path="/etiquetas"
          element={
            <Protegida permissao="etiquetas.ler">
              <PaginaEtiquetas />
            </Protegida>
          }
        />
        <Route
          path="/estoque"
          element={
            <Protegida permissao="estoque.ler">
              <PaginaEstoque />
            </Protegida>
          }
        />
        <Route
          path="/materia-prima"
          element={
            <Protegida permissao="materiaprima.ler">
              <PaginaMateriaPrima />
            </Protegida>
          }
        />
        <Route
          path="/layouts-etiqueta"
          element={
            <Protegida permissao="cadastros.ler">
              <PaginaLayouts />
            </Protegida>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <MantineProvider theme={tema}>
      <DatesProvider settings={{ locale: 'pt-br', firstDayOfWeek: 0 }}>
        <Notifications position="top-right" />
        <QueryClientProvider client={clienteConsultas}>
          <BrowserRouter>
            <ProvedorAutenticacao>
              <Aplicacao />
            </ProvedorAutenticacao>
          </BrowserRouter>
        </QueryClientProvider>
      </DatesProvider>
    </MantineProvider>
  </StrictMode>,
);
