'use client';

import { useState } from 'react';
import { Bot, BrainCircuit, Gauge, RefreshCw, Sparkles } from 'lucide-react';

import { AiPlayground } from '@/components/agents/ai-playground';
import { AiUsage } from '@/components/agents/ai-usage';
import { FollowUpAgentConfig } from '@/components/agents/follow-up-agent-config';
import { AiConfig } from '@/components/settings/ai-config';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type Tab = 'playground' | 'brain' | 'follow-up' | 'usage';

export default function AgentsPage() {
  const [tab, setTab] = useState<Tab>('brain');

  return (
    <div className="nexora-page-stack">
      <div className="border-primary/15 from-primary/8 via-card to-card relative overflow-hidden rounded-[28px] border bg-gradient-to-br p-6 sm:p-8">
        <div className="bg-primary/12 pointer-events-none absolute -top-24 right-0 size-64 rounded-full blur-3xl" />
        <div className="relative flex items-center gap-3">
          <span className="bg-primary/10 text-primary ring-primary/15 flex size-12 items-center justify-center rounded-2xl ring-1">
            <Bot className="size-6" />
          </span>
          <h1 className="text-foreground text-3xl font-bold tracking-[-0.04em] sm:text-4xl">
            Agentes IA
          </h1>
        </div>
        <p className="text-muted-foreground relative mt-4 max-w-3xl text-[15px] leading-7 sm:text-base">
          Configura el cerebro de tu empresa, pruébalo de forma segura y
          controla su consumo con Puntos Nexora.
        </p>
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as Tab)}
        className="gap-5"
      >
        <TabsList>
          <TabsTrigger value="brain">
            <BrainCircuit className="mr-1.5 size-4" /> Configuración
          </TabsTrigger>
          <TabsTrigger value="playground">
            <Sparkles className="mr-1.5 size-4" /> Probar agente
          </TabsTrigger>
          <TabsTrigger value="follow-up">
            <RefreshCw className="mr-1.5 size-4" /> Seguimiento Pro
          </TabsTrigger>
          <TabsTrigger value="usage">
            <Gauge className="mr-1.5 size-4" /> Consumo
          </TabsTrigger>
        </TabsList>

        <TabsContent value="playground" className="mt-1">
          <AiPlayground onGoToSetup={() => setTab('brain')} />
        </TabsContent>
        <TabsContent value="brain" className="mt-1">
          <AiConfig />
        </TabsContent>
        <TabsContent value="follow-up" className="mt-1">
          <FollowUpAgentConfig />
        </TabsContent>
        <TabsContent value="usage" className="mt-1">
          <AiUsage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
