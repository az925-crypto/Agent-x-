import { useCallback } from 'react';
import type { AIClient } from './tools/ai-agent/provider';
import { analyzeWithAIStream } from './tools/ai-agent/shared';
import { runIG, runScan, runSherlock, runIGFollowers, runIGFollowing, runIGMedia, runIGDownload } from './tools/orchestrator';
import type { LogEntry, TaskCtx } from './cli-ui-types';

interface UseCommandsDeps {
  ai: React.MutableRefObject<AIClient | null>;
  pushLog: (entry: Omit<LogEntry, 'id'>) => void;
  pushBlank: () => void;
  createTask: (label: string, detail: string) => [TaskCtx, number];
  streamAI: (prompt: string) => Promise<string>;
}

export function useCommands({ ai, pushLog, pushBlank, createTask, streamAI }: UseCommandsDeps) {
  const commandHelp = useCallback(() => {
    pushBlank();
    pushLog({ type: 'divider', content: '┌─ Commands ──────────────────────────────────┐' });
    const cmds: [string, string][] = [
      ['ig <user>',         'Instagram profile + AI analysis'],
      ['similar <user>',    'Cross-platform username search'],
      ['scan <target>',     'DNS/GeoIP + AI analysis'],
      ['followers <user>',  'Instagram followers list'],
      ['following <user>',  'Instagram following list'],
      ['media <user> [n]',  'Instagram posts + comments'],
      ['download <user> [n]', 'Download Instagram media'],
      ['chat',              'Agentic AI mode'],
      ['reconnect',         'Reload AI provider from .env'],
      ['clear',             'Clear screen'],
      ['exit',              'Exit'],
    ];
    for (const [cmd, desc] of cmds) {
      pushLog({ type: 'text', content: `  ${cmd.padEnd(20)} ${desc}` });
    }
    pushLog({ type: 'divider', content: '└─────────────────────────────────────────────┘' });
    pushBlank();
  }, [pushLog, pushBlank]);

  const commandIG = useCallback(async (username: string) => {
    if (!ai.current) { pushLog({ type: 'fail', content: 'AI not configured', elapsed: 0 }); return; }

    const [ctx] = createTask('ig', `@${username}`);
    let profileData: Record<string, unknown>;
    try {
      ctx.progress('fetching Instagram profile...');
      const result = await runIG(username, (_type: string, chunk: string) => {
        const lines = chunk.trim().split('\n').filter(Boolean);
        for (const line of lines) ctx.progress(`[py] ${line.slice(0, 100)}`);
      });
      if (!result.success) { ctx.fail(String(result.error || 'Tool failed')); return; }
      profileData = result.data as Record<string, unknown>;
      if (!profileData) { ctx.fail('No data returned from IG tool'); return; }
      const p = profileData.profile as Record<string, unknown> | undefined;
      if (!p) { ctx.fail('Profile data is empty'); return; }
      ctx.done(`${p.fullName} (@${p.username})`);

      const [statsCtx] = createTask('stats', `${p.followerCount} followers  ${p.followingCount} following`);
      if (p.publicEmail) statsCtx.progress(`email: ${p.publicEmail}`);
      if (p.externalUrl) statsCtx.progress(`url: ${p.externalUrl}`);
      if (p.biography) statsCtx.progress(`bio: ${(p.biography as string).slice(0, 180)}`);
      statsCtx.done();

      const followers = (profileData.followerList as Array<Record<string, unknown>>) || [];
      const following = (profileData.followingList as Array<Record<string, unknown>>) || [];

      if (followers.length > 0) {
        pushLog({ type: 'text', content: `followers: ${followers.length} shown` });
        for (const f of followers.slice(0, 10)) pushLog({ type: 'text', content: `  @${f.username}  ${f.fullName}${f.isVerified ? ' ✓' : ''}` });
        if (followers.length > 10) pushLog({ type: 'text', content: `  ... +${followers.length - 10} more` });
      }
      if (following.length > 0) {
        pushLog({ type: 'text', content: `following: ${following.length} shown` });
        for (const f of following.slice(0, 10)) pushLog({ type: 'text', content: `  @${f.username}  ${f.fullName}${f.isVerified ? ' ✓' : ''}` });
        if (following.length > 10) pushLog({ type: 'text', content: `  ... +${following.length - 10} more` });
      }
    } catch (e: unknown) {
      ctx.fail(e instanceof Error ? e.message : String(e));
      return;
    }

    const [aiCtx] = createTask('ai', 'analyzing...');
    try {
      const prompt = `Intelligence analysis for @${username}.\nData: ${JSON.stringify(profileData, null, 2)}\nReturn JSON: {"username":"","aiBioAnalysis":"","followingAnalysis":"","threatOrRiskLevel":""}`;
      const response = await streamAI(prompt);
      aiCtx.done();
      try {
        const data = JSON.parse(response);
        pushLog({ type: 'divider', content: `┌─ Instagram Intelligence ─────────────────────┐` });
        pushLog({ type: 'text', content: ` threat:   ${data.threatOrRiskLevel || 'N/A'}` });
        pushLog({ type: 'text', content: ` bio:      ${(data.aiBioAnalysis || 'N/A').slice(0, 160)}` });
        pushLog({ type: 'text', content: ` network:  ${(data.followingAnalysis || 'N/A').slice(0, 160)}` });
        pushLog({ type: 'divider', content: `└──────────────────────────────────────────────┘` });
      } catch { /* raw output already in completedLogs via stream */ }
    } catch (e: unknown) {
      aiCtx.fail(e instanceof Error ? e.message : String(e));
    }
    pushBlank();
  }, [createTask, streamAI, pushLog, pushBlank, ai]);

  const commandSimilar = useCallback(async (username: string) => {
    if (!ai.current) { pushLog({ type: 'fail', content: 'AI not configured', elapsed: 0 }); return; }

    const [ctx] = createTask('sherlock', `@${username}`);
    let foundPlatforms: string[] = [];

    try {
      const result = await runSherlock(username, (name: string, status: string) => {
        if (status === 'found') ctx.progress(`✓ ${name}`);
        else if (status === 'checking') ctx.progress(`  ${name}...`);
      });
      if (result.success) foundPlatforms = result.data.foundPlatforms;
      ctx.done(`${foundPlatforms.length} platforms found`);
    } catch (e: unknown) {
      ctx.fail(e instanceof Error ? e.message : String(e));
      return;
    }

    const [aiCtx] = createTask('ai', 'analyzing footprint...');
    try {
      const prompt = `OSINT analysis of username "${username}". Active on: [${foundPlatforms.join(', ')}]. Return JSON: {"target":"","confirmedActivePlatforms":[],"digitalFootprintRisk":"","aiAnalysis":""}`;
      const response = await streamAI(prompt);
      aiCtx.done();
      try {
        const data = JSON.parse(response);
        pushLog({ type: 'divider', content: `┌─ Cross-Platform Intelligence ────────────────┐` });
        pushLog({ type: 'text', content: ` risk:     ${data.digitalFootprintRisk || 'N/A'}` });
        if (data.confirmedActivePlatforms?.length) {
          pushLog({ type: 'text', content: ` found:    ${data.confirmedActivePlatforms.join(', ')}` });
        }
        pushLog({ type: 'text', content: ` analysis: ${(data.aiAnalysis || 'N/A').slice(0, 160)}` });
        pushLog({ type: 'divider', content: `└──────────────────────────────────────────────┘` });
      } catch { /* raw stream already logged */ }
    } catch (e: unknown) {
      aiCtx.fail(e instanceof Error ? e.message : String(e));
    }
    pushBlank();
  }, [createTask, streamAI, pushLog, pushBlank, ai]);

  const commandScan = useCallback(async (target: string) => {
    if (!ai.current) { pushLog({ type: 'fail', content: 'AI not configured', elapsed: 0 }); return; }

    const [ctx] = createTask('scan', target);
    let scanData: Record<string, unknown>;
    try {
      ctx.progress('DNS resolution...');
      const result = await runScan(target);
      if (!result.success) { ctx.fail(result.error || 'scan failed'); return; }
      scanData = result.data as unknown as Record<string, unknown>;
      const ips = (scanData.resolvedIPs as string[]) || [];
      const geo = (scanData.geoData as Record<string, unknown>) || {};
      if (ips.length) ctx.progress(`IP: ${ips.join(', ')}`);
      if (geo.organization_name || geo.organization) {
        ctx.progress(`${geo.organization_name || geo.organization}${geo.city ? ', ' + geo.city : ''}${geo.country ? ', ' + geo.country : ''}`);
      }
      if (geo.asn) ctx.progress(`ASN: ${geo.asn}`);
      ctx.done();
    } catch (e: unknown) {
      ctx.fail(e instanceof Error ? e.message : String(e));
      return;
    }

    const [aiCtx] = createTask('ai', 'analyzing...');
    try {
      const prompt = `OSINT network analysis: ${target}. Data: ${JSON.stringify(scanData, null, 2)}. Return JSON: {"target":"","resolvedIPs":[],"geoIPData":{},"infrastructureAnalysis":"","aiConclusion":""}`;
      const response = await streamAI(prompt);
      aiCtx.done();
      try {
        const data = JSON.parse(response);
        pushLog({ type: 'divider', content: `┌─ Network Intelligence ───────────────────────┐` });
        if (Array.isArray(data.resolvedIPs)) pushLog({ type: 'text', content: ` IPs:      ${data.resolvedIPs.join(', ')}` });
        pushLog({ type: 'text', content: ` analysis: ${(data.infrastructureAnalysis || 'N/A').slice(0, 160)}` });
        if (data.aiConclusion) pushLog({ type: 'text', content: ` next:     ${data.aiConclusion.slice(0, 160)}` });
        pushLog({ type: 'divider', content: `└──────────────────────────────────────────────┘` });
      } catch { /* raw stream logged */ }
    } catch (e: unknown) {
      aiCtx.fail(e instanceof Error ? e.message : String(e));
    }
    pushBlank();
  }, [createTask, streamAI, pushLog, pushBlank, ai]);

  const commandFollowers = useCallback(async (username: string) => {
    const [ctx] = createTask('followers', `@${username}`);
    try {
      const result = await runIGFollowers(username, (_type: string, chunk: string) => {
        chunk.trim().split('\n').filter(Boolean).forEach((l: string) => ctx.progress(`[py] ${l.slice(0, 100)}`));
      });
      const data = result.data as Record<string, unknown>;
      const list = (data.followers as Array<Record<string, unknown>>) || [];
      ctx.done(`total: ${data.total_followers}`);
      for (const f of list) pushLog({ type: 'text', content: `@${f.username}  ${f.full_name || ''}${f.is_private ? ' 🔒' : ''}` });
    } catch (e: unknown) {
      ctx.fail(e instanceof Error ? e.message : String(e));
    }
    pushBlank();
  }, [createTask, pushLog, pushBlank]);

  const commandFollowing = useCallback(async (username: string) => {
    const [ctx] = createTask('following', `@${username}`);
    try {
      const result = await runIGFollowing(username, (_type: string, chunk: string) => {
        chunk.trim().split('\n').filter(Boolean).forEach((l: string) => ctx.progress(`[py] ${l.slice(0, 100)}`));
      });
      const data = result.data as Record<string, unknown>;
      const list = (data.following as Array<Record<string, unknown>>) || [];
      ctx.done(`total: ${data.total_following}`);
      for (const f of list) pushLog({ type: 'text', content: `@${f.username}  ${f.full_name || ''}${f.is_private ? ' 🔒' : ''}` });
    } catch (e: unknown) {
      ctx.fail(e instanceof Error ? e.message : String(e));
    }
    pushBlank();
  }, [createTask, pushLog, pushBlank]);

  const commandMedia = useCallback(async (username: string, amount: number) => {
    const [ctx] = createTask('media', `@${username} × ${amount}`);
    try {
      const result = await runIGMedia(username, amount, (_type: string, chunk: string) => {
        chunk.trim().split('\n').filter(Boolean).forEach((l: string) => ctx.progress(`[py] ${l.slice(0, 100)}`));
      });
      const data = result.data as Record<string, unknown>;
      const posts = (data.posts as Array<Record<string, unknown>>) || [];
      ctx.done(`${posts.length} posts`);
      for (const post of posts) {
        const labels: Record<number, string> = { 1: 'photo', 2: 'video', 8: 'album' };
        const label = labels[post.media_type as number] || '?';
        pushLog({ type: 'text', content: `  [${label}] ${post.code}  ❤ ${post.like_count}  💬 ${post.comment_count}` });
        if (post.caption) pushLog({ type: 'text', content: `  ${(post.caption as string).slice(0, 200)}` });
        const comments = (post.comments as Array<Record<string, unknown>>) || [];
        for (const c of comments.slice(0, 3)) {
          pushLog({ type: 'text', content: `  @${c.username}: ${(c.text as string || '').slice(0, 100)}` });
        }
        if (comments.length > 3) pushLog({ type: 'text', content: `  ... +${comments.length - 3} more comments` });
        pushBlank();
      }
    } catch (e: unknown) {
      ctx.fail(e instanceof Error ? e.message : String(e));
    }
  }, [createTask, pushLog, pushBlank]);

  const commandDownload = useCallback(async (username: string, amount: number) => {
    const [ctx] = createTask('download', `@${username} × ${amount}`);
    try {
      const result = await runIGDownload(username, amount, (_type: string, chunk: string) => {
        chunk.trim().split('\n').filter(Boolean).forEach((l: string) => ctx.progress(`[py] ${l.slice(0, 100)}`));
      });
      const data = result.data as Record<string, unknown>;
      const items = (data.items as Array<Record<string, unknown>>) || [];
      ctx.done(`${data.total_downloaded} files → ${data.download_dir}`);
      for (const item of items) {
        const p = item.download_path || (item.download_paths as string[] || []).join(', ') || 'failed';
        if (item.download_error) pushLog({ type: 'fail', content: `${item.code}: ${item.download_error}`, elapsed: 0 });
        else pushLog({ type: 'text', content: `  ${item.code} → ${p}` });
      }
    } catch (e: unknown) {
      ctx.fail(e instanceof Error ? e.message : String(e));
    }
    pushBlank();
  }, [createTask, pushLog, pushBlank]);

  return { commandHelp, commandIG, commandSimilar, commandScan, commandFollowers, commandFollowing, commandMedia, commandDownload };
}
