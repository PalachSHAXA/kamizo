// PR-8 (feat/smeta-approval-workflow): unit-тесты футера «Утверждение».

import { describe, expect, it } from 'vitest';
import { renderApprovalFooterHtml, type ApprovalFields } from '../estimateApprovalFooter';

const esc = (s: string) => s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c] || c);

describe('renderApprovalFooterHtml — baseline-инвариант', () => {
  it('null / undefined → пустая строка', () => {
    expect(renderApprovalFooterHtml(null, 'ru', esc)).toBe('');
    expect(renderApprovalFooterHtml(undefined, 'ru', esc)).toBe('');
  });

  it('approval_status=draft → пустая строка (baseline-случай)', () => {
    const e: ApprovalFields = {
      approval_status: 'draft',
      approval_meeting_id: 'm1',
      approval_protocol_number: '4',
    };
    expect(renderApprovalFooterHtml(e, 'ru', esc)).toBe('');
  });

  it('approval_status=pending → пустая строка', () => {
    expect(renderApprovalFooterHtml({ approval_status: 'pending', approval_protocol_number: '4' }, 'ru', esc)).toBe('');
  });

  it('approval_status=rejected → пустая строка', () => {
    expect(renderApprovalFooterHtml({ approval_status: 'rejected' }, 'ru', esc)).toBe('');
  });

  it('approval_status=approved, но ВСЕ approval_meeting_* пусты → пустая строка (нет ничего юр.-значимого показать)', () => {
    const e: ApprovalFields = {
      approval_status: 'approved',
      approved_at: '2026-08-10',
      approved_by_name: 'Иванов И.И.',
      approval_meeting_id: null,
      approval_protocol_number: null,
      approval_vote_result: null,
      approval_signed_at: null,
      approval_meeting_confirmed_at: null,
      approval_notes: null,
    };
    expect(renderApprovalFooterHtml(e, 'ru', esc)).toBe('');
  });

  it('approval_status=approved + пустые строки (не null) → пустая строка', () => {
    const e: ApprovalFields = {
      approval_status: 'approved',
      approval_meeting_id: '',
      approval_protocol_number: '   ',
      approval_vote_result: '',
    };
    expect(renderApprovalFooterHtml(e, 'ru', esc)).toBe('');
  });
});

describe('renderApprovalFooterHtml — рендер с данными', () => {
  const fullApproval: ApprovalFields = {
    approval_status: 'approved',
    approved_at: '2026-08-15T10:00:00',
    approved_by_name: 'Иванов И.И.',
    approval_meeting_id: 'meet-abc',
    approval_meeting_number: 4,
    approval_meeting_confirmed_at: '2026-08-05T18:00:00',
    approval_protocol_number: '№4',
    approval_agenda_item_id: 'ag-1',
    approval_vote_result: '85% за, 10% против, 5% воздержались',
    approval_signed_at: '2026-08-06',
    approval_notes: 'С условием ежеквартального отчёта',
  };

  it('заголовок секции «Утверждение»', () => {
    const html = renderApprovalFooterHtml(fullApproval, 'ru', esc);
    expect(html).toContain('Утверждение');
    expect(html).toContain('footer-approval');
  });

  it('дата собрания + номер протокола + номер собрания в одну строку', () => {
    const html = renderApprovalFooterHtml(fullApproval, 'ru', esc);
    expect(html).toContain('Утверждено решением общего собрания собственников');
    expect(html).toContain('от 2026-08-05');
    expect(html).toContain('протокол №4');
    expect(html).toContain('собрание №4');
  });

  it('итоги голосования показываются отдельной строкой', () => {
    const html = renderApprovalFooterHtml(fullApproval, 'ru', esc);
    expect(html).toContain('Итоги голосования');
    expect(html).toContain('85% за, 10% против, 5% воздержались');
  });

  it('дата подписания протокола', () => {
    const html = renderApprovalFooterHtml(fullApproval, 'ru', esc);
    expect(html).toContain('Протокол подписан');
    expect(html).toContain('2026-08-06');
  });

  it('кто внёс отметку об утверждении в системе', () => {
    const html = renderApprovalFooterHtml(fullApproval, 'ru', esc);
    expect(html).toContain('Отметку об утверждении внёс');
    expect(html).toContain('Иванов И.И.');
  });

  it('заметки к утверждению', () => {
    const html = renderApprovalFooterHtml(fullApproval, 'ru', esc);
    expect(html).toContain('Примечания');
    expect(html).toContain('С условием ежеквартального отчёта');
  });

  it('минимальный набор: только protocol_number → рендерится с fallback на approved_at', () => {
    const e: ApprovalFields = {
      approval_status: 'approved',
      approved_at: '2026-09-01',
      approval_protocol_number: '№1',
    };
    const html = renderApprovalFooterHtml(e, 'ru', esc);
    expect(html).toContain('Утверждение');
    expect(html).toContain('от 2026-09-01');
    expect(html).toContain('протокол №1');
  });

  it('узбекская локализация', () => {
    const html = renderApprovalFooterHtml(fullApproval, 'uz', esc);
    expect(html).toContain('Tasdiqlash');
    expect(html).toContain('Egalar umumiy yig');
    expect(html).toContain('protokol №4');
    expect(html).toContain('Ovoz berish natijalari');
  });

  it('XSS-guard: vote_result и notes экранируются', () => {
    const e: ApprovalFields = {
      approval_status: 'approved',
      approval_protocol_number: '<script>alert(1)</script>',
      approval_vote_result: '<img src=x onerror=alert(1)>',
      approval_notes: '</div><script>bad</script>',
    };
    const html = renderApprovalFooterHtml(e, 'ru', esc);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&lt;/div&gt;&lt;script&gt;bad&lt;/script&gt;');
    expect(html).not.toContain('<script>alert');
    expect(html).not.toContain('<img src=x');
  });

  it('дата обрезается до 10 символов (ISO YYYY-MM-DD, без времени)', () => {
    const e: ApprovalFields = {
      approval_status: 'approved',
      approval_meeting_confirmed_at: '2026-08-05T18:00:00.123Z',
      approval_signed_at: '2026-08-06T09:30:00',
    };
    const html = renderApprovalFooterHtml(e, 'ru', esc);
    expect(html).toContain('от 2026-08-05');
    expect(html).not.toContain('T18:00');
    expect(html).toContain('Протокол подписан: 2026-08-06');
    expect(html).not.toContain('T09:30');
  });
});
