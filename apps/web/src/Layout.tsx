import { useState, type ReactNode } from 'react';
import {
  AppShell,
  Badge,
  Burger,
  Group,
  Menu,
  NavLink,
  ScrollArea,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconAdjustments,
  IconBox,
  IconBuildingFactory2,
  IconCalendarTime,
  IconChevronDown,
  IconClipboardList,
  IconDeviceTablet,
  IconHistory,
  IconHome,
  IconKey,
  IconLogout,
  IconMapPin,
  IconPackages,
  IconPlayerPause,
  IconPrinter,
  IconRecycle,
  IconSettings,
  IconTag,
  IconTools,
  IconUsers,
  IconUsersGroup,
  IconClock,
  IconReport,
  IconBarrel,
  IconBuildingWarehouse,
  IconBarcode,
  IconSettingsCog,
  IconListNumbers,
  IconStack2,
  IconFileSpreadsheet,
  IconChecklist,
  IconFileExport,
} from '@tabler/icons-react';
import { Link, Outlet, useLocation } from 'react-router';
import { ROTULO_PERFIL, type Permissao } from '@apontamento/shared';
import { useAutenticacao } from './autenticacao/ContextoAutenticacao';
import { ModalTrocarSenha } from './paginas/TrocarSenha';

interface ItemMenu {
  rotulo: string;
  caminho: string;
  icone: ReactNode;
  permissao?: Permissao;
}

const GRUPOS: { titulo: string; itens: ItemMenu[] }[] = [
  { titulo: '', itens: [{ rotulo: 'Início', caminho: '/', icone: <IconHome size={18} /> }] },
  {
    titulo: 'Apontamento',
    itens: [
      {
        rotulo: 'Apontamento',
        caminho: '/apontamento',
        icone: <IconDeviceTablet size={18} />,
        permissao: 'apontamento.lancar',
      },
      {
        rotulo: 'Turnos e relatórios',
        caminho: '/turnos',
        icone: <IconReport size={18} />,
        permissao: 'turnos.ler',
      },
      {
        rotulo: 'Aprovações',
        caminho: '/aprovacoes',
        icone: <IconChecklist size={18} />,
        permissao: 'aprovacoes.ler',
      },
      {
        rotulo: 'Apuração e exportação',
        caminho: '/apuracao',
        icone: <IconFileExport size={18} />,
        permissao: 'exportacao.ler',
      },
    ],
  },
  {
    titulo: 'Materiais e estoque',
    itens: [
      {
        rotulo: 'Matéria-prima',
        caminho: '/materia-prima',
        icone: <IconBarrel size={18} />,
        permissao: 'materiaprima.ler',
      },
      {
        rotulo: 'Estoque',
        caminho: '/estoque',
        icone: <IconBuildingWarehouse size={18} />,
        permissao: 'estoque.ler',
      },
      {
        rotulo: 'Etiquetas',
        caminho: '/etiquetas',
        icone: <IconBarcode size={18} />,
        permissao: 'etiquetas.ler',
      },
    ],
  },
  {
    titulo: 'Planejamento',
    itens: [
      {
        rotulo: 'Ordens de produção',
        caminho: '/ordens',
        icone: <IconListNumbers size={18} />,
        permissao: 'ordens.ler',
      },
      { rotulo: 'Rodadas', caminho: '/rodadas', icone: <IconStack2 size={18} />, permissao: 'rodadas.ler' },
      {
        rotulo: 'Importação Excel',
        caminho: '/importacoes',
        icone: <IconFileSpreadsheet size={18} />,
        permissao: 'importacoes.ler',
      },
    ],
  },
  {
    titulo: 'Engenharia',
    itens: [
      {
        rotulo: 'Fichas técnicas',
        caminho: '/fichas-tecnicas',
        icone: <IconClipboardList size={18} />,
        permissao: 'fichas.ler',
      },
      {
        rotulo: 'Máquinas',
        caminho: '/maquinas',
        icone: <IconBuildingFactory2 size={18} />,
        permissao: 'cadastros.ler',
      },
      { rotulo: 'Moldes', caminho: '/moldes', icone: <IconTools size={18} />, permissao: 'cadastros.ler' },
      { rotulo: 'Produtos', caminho: '/produtos', icone: <IconBox size={18} />, permissao: 'cadastros.ler' },
      {
        rotulo: 'Conjuntos padrão',
        caminho: '/conjuntos-padrao',
        icone: <IconPackages size={18} />,
        permissao: 'cadastros.ler',
      },
    ],
  },
  {
    titulo: 'Turnos',
    itens: [
      {
        rotulo: 'Escala',
        caminho: '/escala',
        icone: <IconCalendarTime size={18} />,
        permissao: 'escala.ler',
      },
      {
        rotulo: 'Horários de turno',
        caminho: '/horarios-turno',
        icone: <IconClock size={18} />,
        permissao: 'cadastros.ler',
      },
      {
        rotulo: 'Equipes',
        caminho: '/equipes',
        icone: <IconUsersGroup size={18} />,
        permissao: 'cadastros.ler',
      },
    ],
  },
  {
    titulo: 'Produção',
    itens: [
      {
        rotulo: 'Motivos de parada',
        caminho: '/motivos-parada',
        icone: <IconPlayerPause size={18} />,
        permissao: 'cadastros.ler',
      },
      {
        rotulo: 'Tipos de perda',
        caminho: '/tipos-perda',
        icone: <IconRecycle size={18} />,
        permissao: 'cadastros.ler',
      },
      {
        rotulo: 'Locais de estoque',
        caminho: '/locais-estoque',
        icone: <IconMapPin size={18} />,
        permissao: 'cadastros.ler',
      },
    ],
  },
  {
    titulo: 'Etiquetas',
    itens: [
      {
        rotulo: 'Impressoras',
        caminho: '/impressoras',
        icone: <IconPrinter size={18} />,
        permissao: 'cadastros.ler',
      },
      {
        rotulo: 'Layouts de etiqueta',
        caminho: '/layouts-etiqueta',
        icone: <IconTag size={18} />,
        permissao: 'cadastros.ler',
      },
      {
        rotulo: 'Dispositivos',
        caminho: '/dispositivos',
        icone: <IconDeviceTablet size={18} />,
        permissao: 'cadastros.ler',
      },
    ],
  },
  {
    titulo: 'Administração',
    itens: [
      { rotulo: 'Usuários', caminho: '/usuarios', icone: <IconUsers size={18} />, permissao: 'usuarios.ler' },
      {
        rotulo: 'Parâmetros',
        caminho: '/parametros',
        icone: <IconAdjustments size={18} />,
        permissao: 'parametros.ler',
      },
      {
        rotulo: 'Auditoria',
        caminho: '/auditoria',
        icone: <IconHistory size={18} />,
        permissao: 'auditoria.ler',
      },
    ],
  },
];

export function Layout() {
  const { usuario, sair, pode } = useAutenticacao();
  const [aberto, { toggle, close }] = useDisclosure();
  const [trocandoSenha, setTrocandoSenha] = useState(false);
  const local = useLocation();

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 260, breakpoint: 'md', collapsed: { mobile: !aberto } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group wrap="nowrap">
            <Burger opened={aberto} onClick={toggle} hiddenFrom="md" size="sm" aria-label="Menu" />
            <IconBuildingFactory2 color="var(--mantine-color-blue-7)" />
            <Text fw={700} visibleFrom="xs">
              Apontamento de Produção
            </Text>
          </Group>
          <Menu position="bottom-end">
            <Menu.Target>
              <UnstyledButton aria-label="Menu do usuário">
                <Group gap={6} wrap="nowrap">
                  <div style={{ textAlign: 'right' }}>
                    <Text size="sm" fw={600}>
                      {usuario?.nome}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {usuario?.perfis.map((p) => ROTULO_PERFIL[p]).join(', ')}
                    </Text>
                  </div>
                  <IconChevronDown size={16} />
                </Group>
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>{usuario?.login}</Menu.Label>
              <Menu.Item leftSection={<IconSettingsCog size={16} />} component={Link} to="/posto">
                Configurar este posto
              </Menu.Item>
              <Menu.Item leftSection={<IconKey size={16} />} onClick={() => setTrocandoSenha(true)}>
                Trocar senha
              </Menu.Item>
              <Menu.Item leftSection={<IconLogout size={16} />} color="red" onClick={() => sair()}>
                Sair
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="xs">
        <ScrollArea>
          {GRUPOS.map((g) => {
            const itens = g.itens.filter((i) => !i.permissao || pode(i.permissao));
            if (itens.length === 0) return null;
            return (
              <div key={g.titulo || 'raiz'}>
                {g.titulo && (
                  <Text size="xs" fw={700} c="dimmed" tt="uppercase" px="sm" mt="md" mb={4}>
                    {g.titulo}
                  </Text>
                )}
                {itens.map((i) => (
                  <NavLink
                    key={i.caminho}
                    component={Link}
                    to={i.caminho}
                    label={i.rotulo}
                    leftSection={i.icone}
                    active={i.caminho === '/' ? local.pathname === '/' : local.pathname.startsWith(i.caminho)}
                    onClick={close}
                    py={10}
                  />
                ))}
              </div>
            );
          })}
          <Group px="sm" mt="xl" gap={4}>
            <IconSettings size={14} color="gray" />
            <Badge variant="outline" color="gray" size="sm">
              Fase 4
            </Badge>
          </Group>
        </ScrollArea>
      </AppShell.Navbar>
      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
      <ModalTrocarSenha
        aberto={trocandoSenha || !!usuario?.deveTrocarSenha}
        obrigatoria={!!usuario?.deveTrocarSenha}
        aoFechar={() => setTrocandoSenha(false)}
      />
    </AppShell>
  );
}
