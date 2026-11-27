# Case studies

One folder per case study, then add its folder name to `caseStudies` in `src/content.js`
(that list sets the order of the billboards on the road).

```
public/work/<id>/deck.md     slide text (below)
public/work/<id>/cover.jpg   billboard image (optional, ~1600x620, under 300 KB)
public/work/<id>/...         slide media: .jpg/.png/.webp images, .mp4/.webm for animated UI
```

## deck.md

```
title: Checkout redesign
thumb: cover.jpg
---
# First slide heading
A paragraph. Blank lines separate paragraphs.

- bullet
- bullet
---
# Second slide
## Optional sub-heading
![Checkout flow](flow.mp4)
```

- Meta lines (`title:`, `thumb:`) come first, then every `---` line starts a new slide.
- `# ` heading, `## ` sub-heading, `- ` bullet, `![caption](file)` image or video.
- A slide with media shows text left, media right. Videos play muted and looping while their slide is open.
- Keep videos short and small: H.264 .mp4, 1280px wide, a few MB each.
