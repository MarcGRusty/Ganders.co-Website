-- Starter content. Everything here is editable or removable in the admin area.

INSERT OR IGNORE INTO pages (slug, title, summary, content_html, status, template) VALUES
('about', 'About', 'The longer version of who I am and why I build.',
 '<p>This page is yours to write. A good About page answers three things: where you came from, what you are building now, and what you care about. Write it the way you would explain it to someone you just met and liked.</p><h2>Where I started</h2><p>[Add your story]</p><h2>What I am building</h2><p>[Add detail]</p><h2>What I care about</h2><p>[Add detail]</p>',
 'published', 'standard');

INSERT INTO kb_entries (title, body, kind, use_for_ideas) VALUES
('My story', 'Write your background here: where you grew up, early jobs, the moment you started your first business, the wins, the failures, and what you learned. The more specific, the better the AI ideas get.', 'story', 1),
('What I believe', 'List the opinions you hold about business, work, and life that not everyone agrees with. One per line is fine.', 'belief', 1),
('How I sound', 'Describe how you talk and write. Words you use, words you never use, how formal or casual you are, and any phrases people associate with you.', 'voice', 1),
('Who I am talking to', 'Describe the people you want reading this site: customers, partners, investors, other founders. What do they care about and what do they need from you?', 'audience', 1);
