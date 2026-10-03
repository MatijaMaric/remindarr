# Remindarr

Tracks movie and TV releases, tells each user where they can watch them, and reminds them when things they care about arrive.

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

### Following

**User follow**:
One user subscribing to another user's activity and recommendations.
_Avoid_: Friend, subscription

**Person follow**:
A user subscribing to a Person so they hear about that Person's New credits. Shown in the UI as "Follow" on a Person's page.
_Avoid_: Person subscription, watching a person

**Person**:
A real-world cast or crew member (actor, director, showrunner) as known to TMDB.
_Avoid_: Actor, celebrity, talent

**Credit**:
A Person's role (cast or crew) on one movie or show.
_Avoid_: Role, appearance, filmography entry

**New credit**:
A Credit that was not part of the Person's credits when the user started following them or at any later check, and that is undated, upcoming, or released within the last 30 days. Talk-show and news-show credits never count.
_Avoid_: New release, new work, announcement

## Relationships

- A user has zero or more **Owned copies** of a title, at most one per **Format**
- An **Owned copy** belongs to a whole title. Owning one season of a show isn't modeled.
- Each **Owned copy** appears in **Where to Watch** as an owned **Offer**, and counts toward **My services**
- An **Owned copy** is independent of tracking: owning a title doesn't track it, and tracking a title doesn't mean you own it
- A **User** has many **Person follows**; a **Person** is followed by many **Users**
- A **Person** has many **Credits**; a **New credit** is reported once per following **User**, in their next digest
