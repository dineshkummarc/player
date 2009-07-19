PLAYER = {
    lastfm_api_key: "b25b959554ed76058ac220b7b2e0a026",
    lastfm_ws_url: "http://james.ws.dev.last.fm",
    lastfm_username: "jwheare",
    
    auth_details: {
        name: "Media Player",
        website: "http://player/",
        receiverurl: "http://player/playdarauth.html"
    },
    q_tracks: {},
    s_tracks: {},
    onResultPlay: function () {
        PLAYER.onResultResume.call(this);
    },
    onResultPause: function () {
        var track_item = PLAYER.s_tracks[this.sID];
        if (track_item) {
            // Switch track highlight in the playlist
            track_item.removeClass('playing');
            track_item.addClass('paused');
        }
    },
    onResultResume: function () {
        var track_item = PLAYER.s_tracks[this.sID];
        if (track_item) {
            // Highlight the track in the playlist
            track_item.removeClass('paused');
            track_item.addClass('playing');
        }
    },
    onResultStop: function () {
        var track_item = PLAYER.s_tracks[this.sID];
        if (track_item) {
            // Remove track highlight in the playlist
            track_item.removeClass('playing');
            track_item.removeClass('paused');
        }
        Playdar.player.stop_current();
    },
    onResultFinish: function () {
        PLAYER.onResultStop.call(this);
    },
    
    /**
     * Called for each track that's detected by the haudio parser
     * Generates a query ID, keeps track of the track row with it, adds
     * a 'resolving' class and returns to QID for the Playdar resolve call.
     * @param {Object} tract A track object with an artist, name and element
     * @returns Query ID used for the resolve call
     * @type String
    **/
    track_handler: function (track) {
        // Add a classname to the item play cell
        var qid = Playdar.Util.generate_uuid();
        var track = $(track.element);
        track.data('qid', qid);
        PLAYER.q_tracks[qid] = track;
        track.addClass('resolving');
        return qid;
    },
    
    pop_track_by_qid: function (qid) {
        var track = PLAYER.q_tracks[qid];
        delete PLAYER.q_tracks[qid];
        return track;
    },
    
    results_handler: function (response, final_answer) {
        // Don't do anything till we're done
        if (!final_answer) {
            return false;
        }
        var track = PLAYER.pop_track_by_qid(response.qid);
        if (!track) {
            throw { error: "No track matching qid: " + response.qid };
        }
        var className = 'notFound';
        if (response.results.length) {
            var result = response.results[0];
            // Register stream on perfect match only
            if (result.score == 1) {
                className = 'resolved';
                var sid = result.sid;
                track.data('sid', sid);
                PLAYER.s_tracks[sid] = track;
                Playdar.player.register_stream(result, {
                    onplay: PLAYER.onResultPlay,
                    onpause: PLAYER.onResultPause,
                    onresume: PLAYER.onResultResume,
                    onstop: PLAYER.onResultStop,
                    onfinish: PLAYER.onResultFinish
                });
            }
        }
        // Update item play button class name
        track.removeClass('resolving').addClass(className);
    },
    
    play_track: function (track) {
        // Find an SID class and play stream
        var sid = track.data('sid');
        if (sid) {
            Playdar.player.play_stream(sid);
            return true;
        }
        return false;
    },
    
    fetch_artists: function () {
        PLAYER.get_artist_page(1);
    },
    artist_names: [],
    get_artist_page: function (page) {
        // console.info('load artist page', page);
        $.getJSON(PLAYER.lastfm_ws_url + "/2.0/?callback=?", {
            method: "library.getartists",
            api_key: PLAYER.lastfm_api_key,
            user: PLAYER.lastfm_username,
            format: "json",
            page: page
        }, function (json) {
            var response = json.artists;
            // Add the artists to our lookup
            $.each(response.artist, function (index, artist) {
                // console.log(page+':'+index, artist.name);
                if (artist.playcount) {
                    PLAYER.artist_names.push(artist.name);
                } else {
                    // console.warn('no plays');
                }
            });
            PLAYER.load_artists();
            // Get the other pages
            var next_page = page + 1;
            if (next_page <= response.totalPages) {
                PLAYER.get_artist_page(next_page);
            }
        });
    },
    artist_lookup: {},
    load_artists: function () {
        // Copy current artist list and sort
        var artist_names = $.makeArray(PLAYER.artist_names);
        artist_names.sort();
        // Build DOM list
        var list = $('<ol>');
        $.each(artist_names, function (index, artist) {
            var id = 'artist_' + index;
            PLAYER.artist_lookup[id] = artist;
            list.append(
                $('<li>').attr('id', id)
                         .append($('<a href="#">').text(artist))
            );
        });
        
        $('#artistsLoading').hide();
        $('#artistList').html(list.html());
    },
    
    fetch_albums: function (artist) {
        $('#albumList').empty();
        $('#chooseAlbum').hide();
        PLAYER.album_lookup = {};
        PLAYER.album_names = [];
        PLAYER.get_album_page(PLAYER.artist_lookup[artist.attr('id')], 1);
    },
    get_album_page: function (artist, page) {
        // console.info('load album page', page);
        $.getJSON(PLAYER.lastfm_ws_url + "/2.0/?callback=?", {
            method: "library.getalbums",
            api_key: PLAYER.lastfm_api_key,
            user: PLAYER.lastfm_username,
            artist: artist,
            format: "json",
            page: page
        }, function (json) {
            var response = json.albums;
            // Add the artists to our lookup
            $.each(response.album, function (index, album) {
                // console.log(page+':'+index, album.name);
                if (album.playcount) {
                    PLAYER.album_names.push(album.name);
                } else {
                    // console.warn('no plays');
                }
            });
            PLAYER.load_albums(artist);
            // Get the other pages if we haven't already
            var next_page = page + 1;
            if (next_page <= response['@attr'].totalPages) {
                PLAYER.get_album_page(next_page);
            }
        });
    },
    load_albums: function (artist) {
        // Copy current albums list and sort
        var album_names = $.makeArray(PLAYER.album_names);
        album_names.sort();
        // Build DOM list
        var list = $('#albumList');
        // All link
        list.append(
            $('<li>').attr('id', 'album_all')
                     .append($('<a href="#">').text('All'))
        );
        $.each(album_names, function (index, album) {
            var id = 'album_' + index;
            PLAYER.album_lookup[id] = {
                'artist': artist,
                'album': album
            };
            list.append(
                $('<li>').attr('id', id)
                         .append($('<a href="#">').text(album))
            );
        });
    },
    
    fetch_tracks: function (album) {
        $('#trackTableBody').empty();
        var album_data = PLAYER.album_lookup[album.attr('id')];
        PLAYER.tracks = [];
        PLAYER.track_lookup = {};
        PLAYER.get_track_page(album_data.artist, album_data.album, 1);
    },
    get_track_page: function (artist, album, page) {
        // console.info('load album page', page);
        $.getJSON(PLAYER.lastfm_ws_url + "/2.0/?callback=?", {
            method: "library.gettracks",
            api_key: PLAYER.lastfm_api_key,
            user: PLAYER.lastfm_username,
            artist: artist,
            album: album,
            format: "json",
            page: page
        }, function (json) {
            var response = json.tracks;
            // Add the artists to our lookup
            $.each(response.track, function (index, track) {
                // console.log(page+':'+index, track.name);
                if (track.playcount) {
                    PLAYER.tracks.push(track);
                } else {
                    // console.warn('no plays');
                }
            });
            PLAYER.load_tracks(artist, album);
            // Get the other pages if we haven't already
            var next_page = page + 1;
            if (next_page <= response['@attr'].totalPages) {
                PLAYER.get_track_page(next_page);
            }
        });
    },
    // TODO Implement
    load_tracks: function (artist, album) {
        // Copy current albums list and sort
        var tracks = $.makeArray(PLAYER.tracks);
        tracks.sort(function (a, b) {
            return a.playcount > b.playcount;
        });
        // Build DOM list
        var tbody = $('#trackTableBody');
        $.each(tracks, function (index, track) {
            var id = 'track_' + index;
            PLAYER.track_lookup[id] = track;
            var trow = $('<tr class="haudio">')
                .append('<td class="play"><a href="#"><span class="resolved">-</span><span class="resolving">.</span><span class="notFound">&nbsp;</span></a></td>')
                .append($('<td>').append($('<a href="#" class="fn">').text(track.name)))
                .append($('<td>').append($('<a href="#">').text('N/A')))
                .append($('<td>').append($('<a href="#" class="contributor">').text(track.artist.name)))
                .append($('<td>').append($('<a href="#">').text(album)));
            tbody.append(trow);
        });
        Playdar.client.autodetect(PLAYER.track_handler);
    },
    
    roster_callback: function (json) {
        var playdar, res, list_item;
        $('#contactLoading').hide();
        $.each(json, function (i, contact) {
            playdar = false;
            for (res in contact.resources) {
                if (contact.resources[res].message == "Daemon not human.") {
                    playdar = true;
                }
            }
            contact_link = $('<a>')
                .text(contact.name || contact.jid)
                .attr('title', contact.jid)
                .attr('href', 'jabber://' + contact.jid);
            if (contact.online) {
                contact_link.addClass('online');
            }
            if (playdar) {
                contact_link.addClass('playdar');
            }
            $('#contactList').append($('<li>').append(contact_link));
        });
    },
    load_roster: function () {
        var query_params = Playdar.client.add_auth_token({
            call_id: new Date().getTime(),
            jsonp: 'PLAYER.roster_callback'
        });
        var url = Playdar.client.get_base_url('/greynet/get_roster', query_params);
        Playdar.Util.loadjs(url);
    }
};