import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { buildConversationPacingContext } from './orchestrator';

describe('AI conversation pacing', () => {
  it('stops asking when the customer reports questionnaire fatigue', () => {
    const context = buildConversationPacingContext([
      { role: 'assistant', content: '¿Qué vehículo buscas?' },
      { role: 'user', content: 'Un SUV' },
      { role: 'assistant', content: '¿Tienes pie?' },
      { role: 'user', content: 'Son muchas preguntas, solo quiero ver autos' },
    ]);

    expect(context).toContain('demasiadas preguntas');
    expect(context).toContain('No hagas ninguna pregunta nueva');
  });

  it('prioritizes inventory when the customer only wants to browse', () => {
    const context = buildConversationPacingContext([
      { role: 'user', content: 'Solo quiero ver su stock de autos' },
    ]);

    expect(context).toContain('quiere revisar vehículos o stock');
    expect(context).toContain('No inicies ni continúes una precalificación');
  });

  it('pauses qualification after several assistant question turns', () => {
    const context = buildConversationPacingContext([
      { role: 'assistant', content: '¿Qué vehículo buscas?' },
      { role: 'user', content: 'SUV' },
      { role: 'assistant', content: '¿Qué presupuesto tienes?' },
      { role: 'user', content: '15 millones' },
      { role: 'assistant', content: '¿Necesitas financiamiento?' },
      { role: 'user', content: 'Sí' },
    ]);

    expect(context).toContain('ya hubo 3 respuestas');
    expect(context).toContain('Aporta valor ahora');
  });

  it('adds no extra guard before the conversation shows friction', () => {
    expect(
      buildConversationPacingContext([
        { role: 'user', content: 'Hola, quiero información' },
      ])
    ).toBeNull();
  });
});
