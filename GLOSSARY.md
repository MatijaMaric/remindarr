# Remindarr

Tracks movie and TV releases and tells each user where they can watch them.

## Language

### Availability

**Offer**:
One way to watch a title: a provider plus how it's offered (stream, free, ads, rent, buy, or owned).
_Avoid_: Source, listing

**Where to Watch**:
All the offers for a title that a given user can see, grouped by how each one is offered.
_Avoid_: Availability list, providers section

**My services**:
The providers a user subscribes to, plus anything they own. A title is "on my services" if the user can watch it now without paying extra.
_Avoid_: Subscriptions, my providers

**Owned copy**:
A user's record that they personally own a title in one specific format. It counts as an offer only for that user.
_Avoid_: Collection, library item, physical media

**Format**:
The medium of an owned copy: DVD, Blu-ray, 4K UHD Blu-ray, digital purchase, VHS, or other.
_Avoid_: Media type, edition

## Relationships

- A user has zero or more **Owned copies** of a title, at most one per **Format**
- An **Owned copy** belongs to a whole title. Owning one season of a show isn't modeled.
- Each **Owned copy** appears in **Where to Watch** as an owned **Offer**, and counts toward **My services**
- An **Owned copy** is independent of tracking: owning a title doesn't track it, and tracking a title doesn't mean you own it
