import { describe, expect, it } from 'vitest'
import { groupAlbums, groupArtists, groupFolders, searchTracks } from '../search'
import type { Track } from '../../types'

function makeTrack(overrides: Partial<Track>): Track {
  return {
    id: overrides.path ?? Math.random().toString(36),
    path: overrides.path ?? '/music/x.mp3',
    ext: 'mp3',
    title: 'Song',
    artist: 'Artist',
    album: 'Album',
    duration: 180,
    coverPath: null,
    genre: 'Rock',
    year: 2020,
    trackNo: null,
    folderId: '/music',
    folderName: 'music',
    size: 1000,
    mtime: 1,
    ...overrides
  }
}

describe('searchTracks', () => {
  const tracks: Track[] = [
    makeTrack({
      path: '/a1.mp3',
      title: '夜空中最亮的星',
      artist: '逃跑计划',
      album: '世界',
      genre: '摇滚'
    }),
    makeTrack({
      path: '/a2.mp3',
      title: 'Like a Rolling Stone',
      artist: 'Bob Dylan',
      album: 'Highway 61',
      genre: 'Rock'
    }),
    makeTrack({
      path: '/a3.mp3',
      title: 'Rolling in the Deep',
      artist: 'Adele',
      album: '21',
      genre: 'Soul'
    }),
    makeTrack({
      path: '/a4.mp3',
      title: '星空',
      artist: '五月天',
      album: '后青春的诗',
      genre: '摇滚'
    })
  ]

  it('matches title substrings with relevance ranking', () => {
    const res = searchTracks(tracks, { text: 'rolling' })
    expect(res.map((t) => t.title)).toEqual(['Rolling in the Deep', 'Like a Rolling Stone'])
  })

  it('matches chinese titles', () => {
    const res = searchTracks(tracks, { text: '星空' })
    expect(res.map((t) => t.title)).toEqual(['星空'])
  })

  it('filters by artist and album exactly', () => {
    expect(searchTracks(tracks, { artist: 'adele' }).map((t) => t.artist)).toEqual(['Adele'])
    expect(searchTracks(tracks, { album: 'Highway 61' }).map((t) => t.title)).toEqual([
      'Like a Rolling Stone'
    ])
  })

  it('matches genre keywords', () => {
    const res = searchTracks(tracks, { genre: '摇滚' })
    expect(res.length).toBe(2)
  })

  it('is case-insensitive', () => {
    expect(searchTracks(tracks, { text: 'ROLLING HOUSE' }).length).toBe(0)
    expect(searchTracks(tracks, { text: 'BOB DYLAN' }).map((t) => t.title)).toEqual([
      'Like a Rolling Stone'
    ])
  })

  it('handles empty queries', () => {
    expect(searchTracks(tracks, {}).length).toBe(0)
  })
})

describe('groupers', () => {
  const tracks: Track[] = [
    makeTrack({ path: '/1.mp3', artist: 'A1', album: 'X', folderId: '/one', folderName: 'One' }),
    makeTrack({ path: '/2.mp3', artist: 'A1', album: 'Y', folderId: '/one', folderName: 'One' }),
    makeTrack({ path: '/3.mp3', artist: 'A2', album: 'X', folderId: '/two', folderName: 'Two' })
  ]

  it('groups artists by count', () => {
    const g = groupArtists(tracks)
    expect(g.find((x) => x.name === 'A1')?.count).toBe(2)
    expect(g.length).toBe(2)
  })

  it('groups albums by artist+album key', () => {
    const g = groupAlbums(tracks)
    // (A1,X), (A1,Y), (A2,X) — same album name under different artists stays separate
    expect(g.length).toBe(3)
    const x = g.filter((a) => a.album === 'X')
    expect(x.length).toBe(2)
    expect(x.map((a) => a.artist).sort()).toEqual(['A1', 'A2'])
    expect(g.find((a) => a.album === 'Y')?.count).toBe(1)
  })

  it('groups folders by scan root', () => {
    const g = groupFolders(tracks)
    expect(g.length).toBe(2)
    expect(g.find((f) => f.folderId === '/one')?.count).toBe(2)
  })
})
